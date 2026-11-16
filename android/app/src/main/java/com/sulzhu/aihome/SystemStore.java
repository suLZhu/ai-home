package com.sulzhu.aihome;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * 系统能力的本机持久化：闹钟计划、已注册 requestCode、已通知 key、待消费的通知点击。
 * 全部放在 App 私有 SharedPreferences；开机恢复 / 去重都只依赖这份快照，不依赖 WebView 是否启动。
 */
final class SystemStore {
    private static final String PREFS = "aihome.system";
    private static final String K_PLAN = "alarmPlan";
    private static final String K_REGISTERED = "alarmRegistered";
    private static final String K_DELIVERED = "delivered";
    private static final String K_PENDING_OPEN = "pendingOpen";
    private static final String K_LAST_RESTORE = "lastRestoreAt";
    private static final String K_AVATARS = "channelAvatars";

    private static final long DELIVERED_TTL = 7L * 24 * 60 * 60 * 1000;
    private static final int MAX_DELIVERED = 400;

    private SystemStore() { }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String get(Context c, String key, String fallback) {
        try { return prefs(c).getString(key, fallback); } catch (Exception e) { return fallback; }
    }

    private static void put(Context c, String key, String value) {
        try { prefs(c).edit().putString(key, value).apply(); } catch (Exception ignored) { }
    }

    private static JSONArray array(Context c, String key) {
        try { return new JSONArray(get(c, key, "[]")); }
        catch (Exception e) { return new JSONArray(); }
    }

    static JSONArray plan(Context c) { return array(c, K_PLAN); }
    static void setPlan(Context c, JSONArray plan) { put(c, K_PLAN, plan.toString()); }

    static JSONArray registered(Context c) { return array(c, K_REGISTERED); }
    static void setRegistered(Context c, JSONArray ids) { put(c, K_REGISTERED, ids.toString()); }

    private static JSONObject delivered(Context c) {
        try { return new JSONObject(get(c, K_DELIVERED, "{}")); }
        catch (Exception e) { return new JSONObject(); }
    }

    static boolean wasDelivered(Context c, String key) {
        return key != null && !key.isEmpty() && delivered(c).has(key);
    }

    static List<String> deliveredKeys(Context c) {
        JSONObject all = delivered(c);
        List<String> out = new ArrayList<>();
        Iterator<String> it = all.keys();
        while (it.hasNext()) out.add(it.next());
        return out;
    }

    static int deliveredCount(Context c) { return delivered(c).length(); }

    /** 带 TTL 与上限的去重集合：重启 / 反复恢复前台后仍能压住重复通知。 */
    static void addDelivered(Context c, String key) {
        if (key == null || key.isEmpty()) return;
        long now = System.currentTimeMillis();
        JSONObject all = delivered(c);
        JSONObject fresh = new JSONObject();
        Iterator<String> it = all.keys();
        while (it.hasNext()) {
            String k = it.next();
            long t = all.optLong(k, 0);
            if (t > now - DELIVERED_TTL) {
                try { fresh.put(k, t); } catch (Exception ignored) { }
            }
        }
        try { fresh.put(key, now); } catch (Exception ignored) { }
        // 只保留最近的 MAX_DELIVERED 条，避免快照无限膨胀。
        if (fresh.length() > MAX_DELIVERED) {
            List<String> keys = new ArrayList<>();
            Iterator<String> ki = fresh.keys();
            while (ki.hasNext()) keys.add(ki.next());
            // 按时间戳升序，丢掉最旧的一批；key 本身是稳定 ID，无需排序稳定性。
            java.util.Collections.sort(keys, (a, b) -> Long.compare(fresh.optLong(a), fresh.optLong(b)));
            int drop = fresh.length() - MAX_DELIVERED;
            for (int i = 0; i < drop && i < keys.size(); i++) fresh.remove(keys.get(i));
        }
        put(c, K_DELIVERED, fresh.toString());
    }

    static void setPendingOpen(Context c, JSONObject payload) {
        put(c, K_PENDING_OPEN, payload == null ? "" : payload.toString());
    }

    /** 取出即清空：一次点击只会被路由一次。 */
    static String takePendingOpen(Context c) {
        String raw = get(c, K_PENDING_OPEN, "");
        if (!raw.isEmpty()) put(c, K_PENDING_OPEN, "");
        return raw;
    }

    /**
     * 助手头像按 assistantId 缓存一份（渠道同步时写入），供开机 / 锁屏期间
     * AlarmReceiver 直接发通知用；闹钟计划本身不重复存大图，避免快照膨胀。
     */
    static void mergeAvatars(Context c, JSONObject updates) {
        if (updates == null || updates.length() == 0) return;
        JSONObject all;
        try { all = new JSONObject(get(c, K_AVATARS, "{}")); } catch (Exception e) { all = new JSONObject(); }
        Iterator<String> it = updates.keys();
        while (it.hasNext()) {
            String id = it.next();
            String value = updates.optString(id, "");
            if (!value.startsWith("data:image/") || value.length() > 200000) continue;
            try { all.put(id, value); } catch (Exception ignored) { }
        }
        put(c, K_AVATARS, all.toString());
    }

    static String avatarFor(Context c, String personId) {
        if (personId == null || personId.isEmpty()) return "";
        try { return new JSONObject(get(c, K_AVATARS, "{}")).optString(personId, ""); }
        catch (Exception e) { return ""; }
    }

    static void markRestored(Context c) {
        try { prefs(c).edit().putLong(K_LAST_RESTORE, System.currentTimeMillis()).apply(); }
        catch (Exception ignored) { }
    }

    static String lastRestoreAt(Context c) {
        try {
            long t = prefs(c).getLong(K_LAST_RESTORE, 0);
            if (t <= 0) return "";
            SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
            return fmt.format(new Date(t));
        } catch (Exception e) { return ""; }
    }

    /** 开机恢复是否有可读取的计划快照：解析失败才算「异常」，空计划是正常的。 */
    static boolean restoreHealthy(Context c) {
        try {
            new JSONArray(get(c, K_PLAN, "[]"));
            return true;
        } catch (Exception e) { return false; }
    }
}
