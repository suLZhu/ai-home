package com.sulzhu.aihome;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * 定时主动任务的正规 Android 调度层：AlarmManager（RTC_WAKEUP）。
 * 有精确闹钟权限 → setExactAndAllowWhileIdle；没有 → setAndAllowWhileIdle 并在状态页显示「受限制」，
 * 绝不因为缺权限直接让任务失效。开机后用持久化计划恢复，同 requestCode 先 cancel 再 set，
 * 已投递 / 已完成 / 已暂停 / 过期太久的任务不再重放。
 * 与 src/taskAlarms.mjs 用同一套 runId 和过滤规则（开机时 WebView 还没起来，必须原生独立实现）。
 */
final class SystemAlarms {
    static final long RESTORE_GRACE_MS = 6L * 60 * 60 * 1000;
    static final int MAX_ALARMS = 60;
    static final String EXTRA_ITEM = "aihome.alarm.item";
    private static final long DAY = 86_400_000L;
    private static final long WEEK = 604_800_000L;

    private SystemAlarms() { }

    static boolean canScheduleExact(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            return am != null && am.canScheduleExactAlarms();
        } catch (Exception e) { return false; }
    }

    static int requestCode(String runId) {
        int code = runId.hashCode() & 0x7fffffff;
        return code == 0 ? 1 : code;
    }

    private static PendingIntent pending(Context c, JSONObject item) {
        Intent i = new Intent(c, AlarmReceiver.class);
        i.putExtra(EXTRA_ITEM, item.toString());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(c, requestCode(item.optString("runId", "")), i, flags);
    }

    private static AlarmManager manager(Context c) {
        return (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
    }

    /** 取消上一轮登记的全部闹钟：重复同步不会留下两份 PendingIntent。 */
    private static void cancelRegistered(Context c) {
        AlarmManager am = manager(c);
        if (am == null) return;
        JSONArray ids = SystemStore.registered(c);
        for (int i = 0; i < ids.length(); i++) {
            String runId = ids.optString(i, "");
            if (runId.isEmpty()) continue;
            try {
                JSONObject stub = new JSONObject().put("runId", runId);
                am.cancel(pending(c, stub));
            } catch (Exception ignored) { }
        }
    }

    /**
     * 过滤规则（restore=true 表示开机恢复）：
     * - 只保留 scheduled；已完成 / 已暂停 / 已取消一律不恢复
     * - 已投递的 runId 不重复恢复、不重复执行
     * - 一次性任务过期超过 6 小时不再补发，避免重启重放历史提醒
     * - 重复任务从过期点递推到下一个未来时刻
     * - 按 runId 去重并限量
     */
    static JSONArray filter(Context c, JSONArray plan, long now, boolean restore) {
        JSONArray out = new JSONArray();
        if (plan == null) return out;
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < plan.length() && out.length() < MAX_ALARMS; i++) {
            JSONObject item = plan.optJSONObject(i);
            if (item == null) continue;
            String runId = item.optString("runId", "");
            if (runId.isEmpty() || seen.contains(runId)) continue;
            if (!"scheduled".equals(item.optString("status", "scheduled"))) continue;
            if (SystemStore.wasDelivered(c, "task:" + runId)) continue;
            long at = item.optLong("at", 0);
            String recurrence = item.optString("recurrence", "once");
            if (at <= now) {
                if (!restore) continue;
                if ("once".equals(recurrence)) {
                    if (now - at > RESTORE_GRACE_MS) continue;
                    at = now + 30_000L;
                } else {
                    long step = "weekly".equals(recurrence) ? WEEK : DAY;
                    long jumps = (now - at + step) / step;
                    at += jumps * step;
                    if (at <= now) at += step;
                }
                try { item.put("at", at); } catch (Exception ignored) { }
            }
            seen.add(runId);
            out.put(item);
        }
        return out;
    }

    /** 用已过滤的计划重新登记；返回值直接喂给 JS 侧 normalizeAlarm()。 */
    static JSONObject register(Context c, JSONArray clean) {
        long now = System.currentTimeMillis();
        AlarmManager am = manager(c);
        cancelRegistered(c);
        SystemStore.setPlan(c, clean == null ? new JSONArray() : clean);
        JSONArray registered = new JSONArray();
        boolean exact = canScheduleExact(c);
        boolean degraded = !exact;
        if (am != null && clean != null) {
            for (int i = 0; i < clean.length(); i++) {
                JSONObject item = clean.optJSONObject(i);
                if (item == null) continue;
                long at = item.optLong("at", 0);
                if (at <= now) continue;
                PendingIntent pi = pending(c, item);
                boolean ok = false;
                if (exact) {
                    try {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                        ok = true;
                    } catch (SecurityException e) {
                        degraded = true; // 权限被系统撤销：降级而非失败
                    }
                }
                if (!ok) {
                    try {
                        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                        ok = true;
                        degraded = true;
                    } catch (Exception ignored) { }
                }
                if (ok) registered.put(item.optString("runId", ""));
            }
        }
        SystemStore.setRegistered(c, registered);
        try {
            return new JSONObject()
                .put("registered", registered.length())
                .put("exact", exact && !degraded)
                .put("degraded", degraded)
                .put("lastRestoreAt", SystemStore.lastRestoreAt(c))
                .put("deliveredCount", SystemStore.deliveredCount(c))
                .put("at", now);
        } catch (Exception e) { return new JSONObject(); }
    }

    /** 前端同步计划：只登记严格未来的任务。 */
    static JSONObject sync(Context c, JSONArray plan) {
        return register(c, filter(c, plan, System.currentTimeMillis(), false));
    }

    /** 开机 / 时间变更：从持久化快照恢复，规则与 JS 的 restoreAlarmPlan() 一致。 */
    static JSONObject restore(Context c) {
        return register(c, filter(c, SystemStore.plan(c), System.currentTimeMillis(), true));
    }

    /** 重复任务触发后，在原生层续排下一次（App 可能长期不打开）。 */
    static void scheduleNext(Context c, JSONObject item) {
        String recurrence = item.optString("recurrence", "once");
        if ("once".equals(recurrence)) return;
        AlarmManager am = manager(c);
        if (am == null) return;
        long step = "weekly".equals(recurrence) ? WEEK : DAY;
        long base = item.optLong("at", 0);
        long now = System.currentTimeMillis();
        if (base <= 0) return;
        long jumps = (now - base + step) / step;
        long next = base + jumps * step;
        if (next <= now) next += step;
        try { item.put("at", next); } catch (Exception ignored) { }
        PendingIntent pi = pending(c, item);
        try {
            if (canScheduleExact(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
        } catch (SecurityException e) {
            try { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi); } catch (Exception ignored) { }
        }
    }
}
