package com.sulzhu.aihome;

import android.Manifest;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 注入到主 WebView 的 AiHomeSystem JS 接口（与 AiHomeOAuth 同一套桥）。
 * 设计边界：只做「检测真实状态 → 简短说明（前端） → 申请权限 / 跳转正确的系统设置页」，
 * 绝不假装能修改 Android 系统策略，也不接受前端传来的任意 Intent / 任意 URL。
 */
final class SystemBridge {
    private static final int REQ_NOTIFICATIONS = 4401;
    private final MainActivity activity;

    SystemBridge(MainActivity activity) { this.activity = activity; }

    private Context ctx() { return activity.getApplicationContext(); }

    @JavascriptInterface
    public String status() {
        try {
            Context c = ctx();
            boolean exact = SystemAlarms.canScheduleExact(c);
            JSONObject alarm = new JSONObject()
                .put("registered", SystemStore.registered(c).length())
                .put("exact", exact)
                .put("degraded", !exact)
                .put("lastRestoreAt", SystemStore.lastRestoreAt(c))
                .put("deliveredCount", SystemStore.deliveredCount(c));
            return new JSONObject()
                .put("sdk", Build.VERSION.SDK_INT)
                .put("notifications", SystemNotifier.notificationsEnabled(c))
                .put("lockScreen", SystemNotifier.lockScreenAvailable(c))
                .put("background", !backgroundRestricted(c))
                .put("battery", ignoringBatteryOptimizations(c))
                .put("overlay", canDrawOverlay(c))
                .put("exactAlarm", exact)
                .put("bootRestore", SystemStore.restoreHealthy(c))
                .put("alarm", alarm)
                .toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    private boolean backgroundRestricted(Context c) {
        if (Build.VERSION.SDK_INT < 28) return false; // 老系统没有这个 API，不伪造「正常」以外的数据
        try {
            ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
            return am != null && am.isBackgroundRestricted();
        } catch (Exception e) { return false; }
    }

    private boolean ignoringBatteryOptimizations(Context c) {
        try {
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            if (pm == null) return false;
            // API < 23 没有电池优化概念，视为已豁免（不受限）。
            if (Build.VERSION.SDK_INT < 23) return true;
            return pm.isIgnoringBatteryOptimizations(c.getPackageName());
        } catch (Exception e) { return false; }
    }

    private boolean canDrawOverlay(Context c) {
        if (Build.VERSION.SDK_INT < 23) return true;
        try { return Settings.canDrawOverlays(c); } catch (Exception e) { return false; }
    }

    /** 字体大小：只接收一个倍数，夹范围与写 textZoom 都由 MainActivity 统一处理。 */
    @JavascriptInterface
    public boolean textZoom(final String json) {
        try {
            JSONObject o = new JSONObject(json == null ? "{}" : json);
            final float factor = (float) o.optDouble("factor", 1.0);
            activity.runOnUiThread(() -> activity.setAppFontFactor(factor));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** 点击状态行：token 白名单，前端无法指定任意 Activity / URL。 */
    @JavascriptInterface
    public void open(final String json) {
        activity.runOnUiThread(() -> {
            String action = "";
            try { action = new JSONObject(json == null ? "{}" : json).optString("action", ""); }
            catch (Exception ignored) { }
            switch (action) {
                case "notification_permission":
                    requestNotificationPermission();
                    break;
                case "app_notification_settings":
                    start(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, ctx().getPackageName()));
                    break;
                case "battery_optimization_request":
                    start(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                        .setData(Uri.parse("package:" + ctx().getPackageName())));
                    break;
                case "battery_optimization_settings":
                    start(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                    break;
                case "overlay_permission":
                    start(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
                        .setData(Uri.parse("package:" + ctx().getPackageName())));
                    break;
                case "exact_alarm_permission":
                    if (Build.VERSION.SDK_INT >= 31) {
                        start(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                            .setData(Uri.parse("package:" + ctx().getPackageName())));
                    } else {
                        appDetails();
                    }
                    break;
                case "autostart_settings":
                    // 厂商自启动白名单没有公开标准 Intent，统一落到本 App 的系统详情页。
                    appDetails();
                    break;
                case "app_details":
                default:
                    appDetails();
                    break;
            }
        });
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && !SystemNotifier.notificationsEnabled(ctx())) {
            try {
                activity.requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, REQ_NOTIFICATIONS);
                return;
            } catch (Exception ignored) { }
        }
        start(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, ctx().getPackageName()));
    }

    private void appDetails() {
        start(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.parse("package:" + ctx().getPackageName())));
    }

    private void start(Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:" + ctx().getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(fallback);
            } catch (Exception ignored) { }
        }
    }

    /** Chat generation owns a foreground service while a stream/tool loop is in flight. */
    @JavascriptInterface
    public boolean generation(String json) {
        try {
            JSONObject body = new JSONObject(json == null ? "{}" : json);
            String action = body.optString("action", "");
            Intent intent = new Intent(ctx(), GenerationService.class);
            if ("start".equals(action)) {
                intent.setAction(GenerationService.ACTION_START);
                intent.putExtra("assistantName", body.optString("assistantName", "栖间"));
                intent.putExtra("assistantId", body.optString("assistantId", ""));
                intent.putExtra("conversationId", body.optString("conversationId", ""));
                intent.putExtra("messageId", body.optString("messageId", ""));
                ContextCompat.startForegroundService(ctx(), intent);
                return true;
            }
            if ("stop".equals(action)) {
                // Do not start a background service just to stop it: Android O+ can reject that.
                ctx().stopService(intent);
                return true;
            }
        } catch (Exception ignored) { }
        return false;
    }

    @JavascriptInterface
    public boolean notify(String json) {
        try { return SystemNotifier.post(ctx(), new JSONObject(json == null ? "{}" : json)); }
        catch (Exception e) { return false; }
    }

    @JavascriptInterface
    public void syncChannels(String json) {
        try {
            JSONObject body = new JSONObject(json == null ? "{}" : json);
            JSONArray channels = body.optJSONArray("channels");
            SystemNotifier.ensureChannels(ctx(), channels == null ? new JSONArray() : channels);
        } catch (Exception ignored) { }
    }

    @JavascriptInterface
    public String syncAlarms(String json) {
        try {
            JSONObject body = new JSONObject(json == null ? "{}" : json);
            JSONArray tasks = body.optJSONArray("tasks");
            return SystemAlarms.sync(ctx(), tasks == null ? new JSONArray() : tasks).toString();
        } catch (Exception e) { return "{}"; }
    }

    /** 冷启动时页面还没装载：先把 payload 存住，等 JS 来取，取走即清空。 */
    @JavascriptInterface
    public String pendingOpen() {
        return SystemStore.takePendingOpen(ctx());
    }

    @JavascriptInterface
    public String deliveredKeys() {
        JSONArray out = new JSONArray();
        for (String key : SystemStore.deliveredKeys(ctx())) out.put(key);
        return out.toString();
    }

    /** 通知点击：MainActivity 的 onCreate / onNewIntent 都会转到这里。 */
    void handleOpenIntent(Intent intent) {
        if (intent == null || !intent.getBooleanExtra(SystemNotifier.EXTRA_FROM_NOTIFICATION, false)) return;
        String raw = intent.getStringExtra(SystemNotifier.EXTRA_PAYLOAD);
        if (raw == null || raw.isEmpty()) return;
        // 真机证据：通知被点击，原生层最先捕获（JS 侧的 notification_tapped 由 onOpen 补记）。
        Log.i("AiHome:gen", "notification_tapped");
        try {
            SystemStore.setPendingOpen(ctx(), new JSONObject(raw));
        } catch (Exception ignored) { }
        intent.removeExtra(SystemNotifier.EXTRA_FROM_NOTIFICATION);
    }

    /** 从系统设置页返回 / 解锁回来：刷新状态列表，并补一次通知点击消费。 */
    void onResume() {
        activity.evalJs("(function(){"
            + "if(window.__aihomeSystemStatusChanged)window.__aihomeSystemStatusChanged();"
            + "if(window.__aihomeSystemResume)window.__aihomeSystemResume();"
            + "})();");
    }
}
