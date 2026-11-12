package com.sulzhu.aihome;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 系统通知：动态渠道（按 assistantId 扩展）、助手头像、正文展开、点击带会话参数。
 * 锁屏可见性显式设为 PRIVATE —— 由系统 / 用户自己的锁屏隐私设置决定显示多少内容，
 * 绝不用 VISIBILITY_PUBLIC 绕过隐私策略。
 */
final class SystemNotifier {
    static final String SYSTEM_CHANNEL_ID = "aihome.system";
    static final String SYSTEM_CHANNEL_NAME = "定时任务 / 系统消息";
    static final String EXTRA_PAYLOAD = "aihome.notification.payload";
    static final String EXTRA_FROM_NOTIFICATION = "aihome.notification.open";

    private SystemNotifier() { }

    static boolean notificationsEnabled(Context c) {
        try { return NotificationManagerCompat.from(c).areNotificationsEnabled(); }
        catch (Exception e) { return false; }
    }

    /** 锁屏通知是否可用：通知总开关 + 系统锁屏显示开关 + 渠道未被设为隐藏/静默。 */
    static boolean lockScreenAvailable(Context c) {
        if (!notificationsEnabled(c)) return false;
        try {
            if (Settings.Secure.getInt(c.getContentResolver(), "lock_screen_show_notifications", 1) == 0) return false;
        } catch (Exception ignored) { }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel ch = nm.getNotificationChannel(SYSTEM_CHANNEL_ID);
                if (ch != null && (ch.getImportance() == NotificationManager.IMPORTANCE_NONE
                    || ch.getLockscreenVisibility() == Notification.VISIBILITY_SECRET)) return false;
            }
        }
        return true;
    }

    /** 只创建 / 更名渠道，不覆盖用户已改过的声音、震动与重要程度。 */
    static void ensureChannels(Context c, JSONArray channels) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureOne(nm, SYSTEM_CHANNEL_ID, SYSTEM_CHANNEL_NAME);
        if (channels == null) return;
        JSONObject avatars = new JSONObject();
        for (int i = 0; i < channels.length(); i++) {
            JSONObject ch = channels.optJSONObject(i);
            if (ch == null) continue;
            String id = ch.optString("channelId", "");
            // 白名单：只接受本 App 前缀，避免网页侧任意创建系统渠道。
            if (!id.startsWith("aihome.") || id.length() > 80) continue;
            String name = ch.optString("channelName", "");
            ensureOne(nm, id, name.isEmpty() ? "助手消息" : name);
            String person = ch.optString("id", "");
            String avatar = ch.optString("avatar", "");
            if (!person.isEmpty() && avatar.startsWith("data:image/")) {
                try { avatars.put(person, avatar); } catch (Exception ignored) { }
            }
        }
        SystemStore.mergeAvatars(c, avatars);
    }

    private static void ensureOne(NotificationManager nm, String id, String name) {
        NotificationChannel existing = nm.getNotificationChannel(id);
        if (existing != null) {
            if (name.equals(String.valueOf(existing.getName()))) return;
            existing.setName(name);
            nm.createNotificationChannel(existing);
            return;
        }
        NotificationChannel channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_DEFAULT);
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        channel.setDescription("主动消息与定时任务");
        nm.createNotificationChannel(channel);
    }

    private static void ensureSingle(Context c, String channelId) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(channelId) == null) {
            JSONObject stub = new JSONObject();
            try { stub.put("channelId", channelId).put("channelName", "助手消息"); } catch (Exception ignored) { }
            JSONArray arr = new JSONArray();
            arr.put(stub);
            ensureChannels(c, arr);
        }
    }

    static int notificationId(String key) {
        int id = key.hashCode() & 0x7fffffff;
        return id == 0 ? 1 : id;
    }

    private static Bitmap largeIcon(String avatar) {
        if (avatar == null || !avatar.startsWith("data:image/")) return null;
        int comma = avatar.indexOf(',');
        if (comma < 0 || avatar.length() > 400000) return null;
        try {
            byte[] bytes = Base64.decode(avatar.substring(comma + 1), Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) return null;
            int size = 192;
            if (bitmap.getWidth() <= size && bitmap.getHeight() <= size) return bitmap;
            return Bitmap.createScaledBitmap(bitmap, size, size, true);
        } catch (Exception e) { return null; }
    }

    /**
     * 发一条系统通知。返回 false = 未授权 / 无效 / 已投递过，调用方不得把它当作成功。
     * test=true 只用于设置页「测试通知」：不进去重集合、可反复测试。
     */
    static boolean post(Context c, JSONObject payload) {
        if (payload == null) return false;
        final String key = payload.optString("key", "");
        if (key.isEmpty()) return false;
        if (!notificationsEnabled(c)) return false;
        final boolean test = payload.optBoolean("test", false);
        if (!test && SystemStore.wasDelivered(c, key)) return false;

        String channelId = payload.optString("channelId", "");
        if (!channelId.startsWith("aihome.")) channelId = SYSTEM_CHANNEL_ID;
        ensureSingle(c, channelId);

        String title = payload.optString("title", "");
        String body = payload.optString("body", "");
        String summary = payload.optString("summary", "");
        if (summary.isEmpty()) summary = body.length() > 110 ? body.substring(0, 110) + "…" : body;
        if (title.isEmpty()) title = "栖间";
        long at = payload.optLong("at", System.currentTimeMillis());

        Intent click = new Intent(c, MainActivity.class);
        click.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        click.putExtra(EXTRA_FROM_NOTIFICATION, true);
        click.putExtra(EXTRA_PAYLOAD, payload.toString());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent content = PendingIntent.getActivity(c, notificationId(key), click, flags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, channelId)
            .setSmallIcon(R.drawable.ic_stat_aihome)
            .setContentTitle(title)
            .setContentText(summary)
            .setStyle(new NotificationCompat.BigTextStyle()
                .bigText(body)
                .setBigContentTitle(title)
                .setSummaryText("主动消息"))
            .setContentIntent(content)
            .setAutoCancel(true)
            .setWhen(at)
            .setShowWhen(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setOnlyAlertOnce(true);
        Bitmap icon = largeIcon(payload.optString("avatar", ""));
        if (icon != null) b.setLargeIcon(icon);
        // 助手名作为标题时，用 LargeIcon 头像；非助手消息（定时任务）不强行塞头像。
        Notification n = b.build();
        try {
            NotificationManagerCompat.from(c).notify(notificationId(key), n);
            if (!test) SystemStore.addDelivered(c, key);
            return true;
        } catch (SecurityException e) {
            return false;
        } catch (Exception e) {
            return false;
        }
    }
}
