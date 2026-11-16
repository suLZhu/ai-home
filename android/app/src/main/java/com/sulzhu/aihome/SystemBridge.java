package com.sulzhu.aihome;

import android.Manifest;
import android.app.ActivityManager;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.os.Environment;
import android.provider.MediaStore;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.webkit.JavascriptInterface;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

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
    private final java.util.concurrent.ConcurrentHashMap<String, java.net.HttpURLConnection> streams = new java.util.concurrent.ConcurrentHashMap<>();

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
                .put("fullScreen", fullScreenAvailable(c))
                .put("bootRestore", SystemStore.restoreHealthy(c))
                .put("alarm", alarm)
                .toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    /**
     * 同步 HTTP POST（仅 HTTPS）：给本地模式直连远程 MCP 用。
     * WebView 的 fetch 会被远端 CORS 拦截，走原生请求则不受同源策略限制。
     * 返回 {"status":200,"headers":{...},"body":"..."} 或 {"error":"..."}。
     */
    @JavascriptInterface
    public String httpPost(String url, String headersJson, String body) {
        try {
            java.net.URL u = new java.net.URL(url);
            if (!"https".equalsIgnoreCase(u.getProtocol())) {
                return new JSONObject().put("error", "仅支持 HTTPS").toString();
            }
            java.net.HttpURLConnection conn = (java.net.HttpURLConnection) u.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(12000);
            conn.setReadTimeout(25000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json, text/event-stream");
            if (headersJson != null) {
                JSONObject h = new JSONObject(headersJson);
                java.util.Iterator<String> it = h.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    conn.setRequestProperty(k, h.optString(k));
                }
            }
            byte[] payload = body == null ? new byte[0] : body.getBytes("UTF-8");
            conn.setFixedLengthStreamingMode(payload.length);
            try (java.io.OutputStream os = conn.getOutputStream()) {
                os.write(payload);
            }
            int code = conn.getResponseCode();
            java.io.InputStream in = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            String text = in == null ? "" : readAll(in);
            JSONObject headers = new JSONObject();
            for (java.util.Map.Entry<String, java.util.List<String>> e : conn.getHeaderFields().entrySet()) {
                if (e.getKey() == null) continue;
                headers.put(e.getKey().toLowerCase(java.util.Locale.ROOT), String.join(",", e.getValue()));
            }
            conn.disconnect();
            return new JSONObject().put("status", code).put("headers", headers).put("body", text).toString();
        } catch (Exception e) {
            try {
                return new JSONObject().put("error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()).toString();
            } catch (Exception ignored) {
                return "{\"error\":\"HTTP 请求失败\"}";
            }
        }
    }

    /**
     * 异步流式 HTTPS POST：订阅聊天（Codex/Claude/Grok）在本地模式直接用原生网络，
     * 不经过浏览器 fetch，因此没有 CORS；每读到一段就回调 __aihomeHttpStream。
     */
    @JavascriptInterface
    public void httpStream(String id, String url, String headersJson, String body) {
        if (id == null || id.isEmpty()) return;
        new Thread(() -> {
            java.net.HttpURLConnection conn = null;
            try {
                java.net.URL u = new java.net.URL(url);
                if (!"https".equalsIgnoreCase(u.getProtocol())) {
                    emitHttpStream(id, new JSONObject().put("type", "error").put("message", "仅支持 HTTPS"));
                    return;
                }
                conn = (java.net.HttpURLConnection) u.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(120000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Accept", "text/event-stream");
                if (headersJson != null) {
                    JSONObject h = new JSONObject(headersJson);
                    java.util.Iterator<String> it = h.keys();
                    while (it.hasNext()) {
                        String k = it.next();
                        conn.setRequestProperty(k, h.optString(k));
                    }
                }
                byte[] out = (body == null ? "" : body).getBytes(StandardCharsets.UTF_8);
                conn.setFixedLengthStreamingMode(out.length);
                try (OutputStream os = conn.getOutputStream()) { os.write(out); }
                int status = conn.getResponseCode();
                streams.put(id, conn);
                emitHttpStream(id, new JSONObject().put("type", "start").put("status", status));
                InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                if (in != null) {
                    try (java.io.Reader reader = new java.io.InputStreamReader(in, StandardCharsets.UTF_8)) {
                        char[] buf = new char[4096];
                        int n;
                        while ((n = reader.read(buf)) > 0) {
                            emitHttpStream(id, new JSONObject().put("type", "chunk").put("text", new String(buf, 0, n)));
                        }
                    }
                }
                emitHttpStream(id, new JSONObject().put("type", "done").put("status", status));
            } catch (Exception e) {
                try { emitHttpStream(id, new JSONObject().put("type", "error").put("message", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage())); }
                catch (Exception ignored) { }
            } finally {
                streams.remove(id);
                if (conn != null) conn.disconnect();
            }
        }, "aihome-http-stream").start();
    }

    @JavascriptInterface
    public void httpStreamCancel(String id) {
        try {
            java.net.HttpURLConnection conn = streams.remove(id);
            if (conn != null) conn.disconnect();
        } catch (Exception ignored) { }
    }

    private void emitHttpStream(String id, JSONObject payload) {
        try {
            activity.evalJs("window.__aihomeHttpStream&&window.__aihomeHttpStream("
                + JSONObject.quote(id) + "," + JSONObject.quote(payload.toString()) + ")");
        } catch (Exception ignored) { }
    }

    /** 兜底内置浏览器：只接受 http/https，交给 WebViewActivity。 */
    @JavascriptInterface
    public boolean openWebView(String url, String title) {
        try {
            java.net.URL u = new java.net.URL(url == null ? "" : url);
            String protocol = u.getProtocol();
            if (!"http".equalsIgnoreCase(protocol) && !"https".equalsIgnoreCase(protocol)) return false;
            Intent intent = new Intent(activity, WebViewActivity.class);
            intent.putExtra("url", url);
            intent.putExtra("title", title == null ? "" : title);
            activity.startActivity(intent);
            return true;
        } catch (Exception e) { return false; }
    }

    /** 当前安装包的版本名（versionName），供「关于栖间」显示。 */
    @JavascriptInterface
    public String appVersion() {
        try { return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
    }

    /** 读取系统剪贴板：长 API Key 直接粘贴，不用手打。 */
    @JavascriptInterface
    public String readClipboard() {
        try {
            ClipboardManager manager = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
            if (manager == null || !manager.hasPrimaryClip()) return "";
            ClipData clip = manager.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return "";
            CharSequence text = clip.getItemAt(0).coerceToText(activity);
            return text == null ? "" : text.toString();
        } catch (Exception e) { return ""; }
    }

    /** 只允许打开 https 外部页面（Grok 设备码授权页），不接受任意 Intent。 */
    @JavascriptInterface
    public void openUrl(String url) {
        try {
            java.net.URL u = new java.net.URL(url);
            if (!"https".equalsIgnoreCase(u.getProtocol())) return;
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Exception ignored) { }
    }

    /** 原生 HTTPS GET：给订阅账号拉 Codex 模型目录用（WebView 直连会被 CORS 拦）。 */
    @JavascriptInterface
    public String httpGet(String url, String headersJson) {
        try {
            java.net.URL u = new java.net.URL(url);
            if (!"https".equalsIgnoreCase(u.getProtocol())) {
                return new JSONObject().put("error", "仅支持 HTTPS").toString();
            }
            java.net.HttpURLConnection conn = (java.net.HttpURLConnection) u.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(12000);
            conn.setReadTimeout(20000);
            conn.setRequestProperty("Accept", "application/json");
            if (headersJson != null) {
                JSONObject h = new JSONObject(headersJson);
                java.util.Iterator<String> it = h.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    conn.setRequestProperty(k, h.optString(k));
                }
            }
            int code = conn.getResponseCode();
            java.io.InputStream in = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            String text = in == null ? "" : readAll(in);
            conn.disconnect();
            return new JSONObject().put("status", code).put("body", text).toString();
        } catch (Exception e) {
            try { return new JSONObject().put("error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()).toString(); }
            catch (Exception ignored) { return "{\"error\":\"GET 请求失败\"}"; }
        }
    }

    private static String readAll(java.io.InputStream in) throws java.io.IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }

    /** Android 14+ 全屏通知（锁屏弹层）需要单独授权；旧系统默认可用。 */
    private boolean fullScreenAvailable(Context c) {
        if (Build.VERSION.SDK_INT < 34) return true;
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            return nm == null || nm.canUseFullScreenIntent();
        } catch (Exception e) { return false; }
    }

    // ── 应用锁：只暴露名单 / PIN / 无障碍状态，不做点击自动化 ──────────────
    @JavascriptInterface
    public String appLockStatus() {
        try {
            return new JSONObject()
                .put("accessibility", AppLockStore.accessibilityEnabled(ctx()))
                .put("hasPin", AppLockStore.hasPin(ctx()))
                .put("locked", AppLockStore.locked(ctx()).size())
                .toString();
        } catch (Exception e) { return "{}"; }
    }

    @JavascriptInterface
    public String appLockApps() {
        return AppLockStore.apps(ctx()).toString();
    }

    @JavascriptInterface
    public String appLockSetLocked(String pkg, boolean locked) {
        try {
            AppLockStore.setLocked(ctx(), pkg, locked);
            return new JSONObject().put("ok", true).toString();
        } catch (Exception e) { return "{\"ok\":false}"; }
    }

    @JavascriptInterface
    public String appLockSetPin(String pin) {
        try {
            boolean ok = AppLockStore.setPin(ctx(), pin);
            return new JSONObject().put("ok", ok).put("error", ok ? "" : "PIN 需要 4–32 位").toString();
        } catch (Exception e) { return "{\"ok\":false,\"error\":\"保存失败\"}"; }
    }

    @JavascriptInterface
    public void appLockOpenSettings() {
        AppLockStore.openAccessibilitySettings(ctx());
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
                case "full_screen_intent_permission":
                    if (Build.VERSION.SDK_INT >= 34) {
                        start(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
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

    // ── 备份文件：固定写到手机「下载/栖间/」，Android 10+ 走 MediaStore，免存储权限 ──
    private static final String BACKUP_DIR_NAME = "栖间";

    private void deleteBackupUriByName(String name) {
        try {
            Uri uri = findBackup(name);
            if (uri != null) ctx().getContentResolver().delete(uri, null, null);
        } catch (Exception ignored) { }
    }

    private Uri findBackup(String name) {
        if (Build.VERSION.SDK_INT < 29) return null;
        try {
            ContentResolver resolver = ctx().getContentResolver();
            String[] projection = { MediaStore.MediaColumns._ID };
            String selection = MediaStore.MediaColumns.DISPLAY_NAME + "=? AND "
                + MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ?";
            String[] args = { name, Environment.DIRECTORY_DOWNLOADS + "/" + BACKUP_DIR_NAME + "%" };
            try (Cursor cursor = resolver.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, projection, selection, args, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    long id = cursor.getLong(0);
                    return ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, id);
                }
            }
        } catch (Exception ignored) { }
        return null;
    }

    private File backupDir() {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), BACKUP_DIR_NAME);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private static String safeBackupName(String filename) {
        String name = filename == null ? "" : filename.trim();
        name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (!name.endsWith(".json")) name += ".json";
        if (name.length() > 120) name = name.substring(0, 116) + ".json";
        return name;
    }

    @JavascriptInterface
    public String saveBackup(String filename, String content) {
        try {
            String name = safeBackupName(filename);
            if (name.isEmpty()) throw new Exception("文件名无效");
            byte[] bytes = (content == null ? "" : content).getBytes(StandardCharsets.UTF_8);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver resolver = ctx().getContentResolver();
                deleteBackupUriByName(name);
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + BACKUP_DIR_NAME);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new Exception("无法创建备份文件");
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new Exception("无法写入备份文件");
                    out.write(bytes);
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(uri, done, null, null);
            } else {
                File dir = backupDir();
                File file = new File(dir, name);
                try (FileOutputStream out = new FileOutputStream(file)) { out.write(bytes); }
            }
            Log.i("AiHome:gen", "backup_saved name=" + name + " bytes=" + bytes.length);
            return new JSONObject().put("ok", true).put("name", name)
                .put("path", "下载/" + BACKUP_DIR_NAME + "/" + name).toString();
        } catch (Exception e) {
            try { return new JSONObject().put("ok", false).put("error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()).toString(); }
            catch (Exception ignored) { return "{\"ok\":false,\"error\":\"保存失败\"}"; }
        }
    }

    @JavascriptInterface
    public String listBackups() {
        JSONArray files = new JSONArray();
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver resolver = ctx().getContentResolver();
                String[] projection = { MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_MODIFIED };
                String selection = MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ?";
                String[] args = { Environment.DIRECTORY_DOWNLOADS + "/" + BACKUP_DIR_NAME + "%" };
                try (Cursor cursor = resolver.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, projection, selection, args,
                    MediaStore.MediaColumns.DATE_MODIFIED + " DESC")) {
                    while (cursor != null && cursor.moveToNext()) {
                        String name = cursor.getString(0);
                        if (name == null || !name.toLowerCase().endsWith(".json")) continue;
                        files.put(new JSONObject().put("name", name)
                            .put("size", cursor.getLong(1))
                            .put("modifiedAt", cursor.getLong(2) * 1000L));
                    }
                }
            } else {
                File[] list = backupDir().listFiles();
                if (list != null) {
                    java.util.Arrays.sort(list, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
                    for (File file : list) {
                        if (!file.isFile() || !file.getName().toLowerCase().endsWith(".json")) continue;
                        files.put(new JSONObject().put("name", file.getName())
                            .put("size", file.length()).put("modifiedAt", file.lastModified()));
                    }
                }
            }
            return new JSONObject().put("ok", true).put("files", files).toString();
        } catch (Exception e) {
            try { return new JSONObject().put("ok", false).put("error", e.getMessage() == null ? "读取失败" : e.getMessage()).put("files", files).toString(); }
            catch (Exception ignored) { return "{\"ok\":false,\"files\":[]}"; }
        }
    }

    @JavascriptInterface
    public String readBackup(String filename) {
        try {
            String name = safeBackupName(filename);
            String content;
            if (Build.VERSION.SDK_INT >= 29) {
                Uri uri = findBackup(name);
                if (uri == null) throw new Exception("找不到备份文件");
                try (InputStream in = ctx().getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new Exception("无法读取备份文件");
                    content = readAll(in);
                }
            } else {
                File file = new File(backupDir(), name);
                try (InputStream in = new FileInputStream(file)) { content = readAll(in); }
            }
            return new JSONObject().put("ok", true).put("name", name).put("content", content).toString();
        } catch (Exception e) {
            try { return new JSONObject().put("ok", false).put("error", e.getMessage() == null ? "读取失败" : e.getMessage()).toString(); }
            catch (Exception ignored) { return "{\"ok\":false}"; }
        }
    }

    @JavascriptInterface
    public String deleteBackup(String filename) {
        try {
            String name = safeBackupName(filename);
            if (Build.VERSION.SDK_INT >= 29) {
                Uri uri = findBackup(name);
                if (uri == null) throw new Exception("找不到备份文件");
                ctx().getContentResolver().delete(uri, null, null);
            } else {
                File file = new File(backupDir(), name);
                if (file.exists() && !file.delete()) throw new Exception("删除失败");
            }
            return new JSONObject().put("ok", true).toString();
        } catch (Exception e) {
            try { return new JSONObject().put("ok", false).put("error", e.getMessage() == null ? "删除失败" : e.getMessage()).toString(); }
            catch (Exception ignored) { return "{\"ok\":false}"; }
        }
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
