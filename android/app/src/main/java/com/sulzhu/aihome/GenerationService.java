package com.sulzhu.aihome;

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Keeps an in-flight assistant generation alive when the WebView is backgrounded.
 * The existing WebView stream/tool loop remains the single execution path; this
 * foreground service raises process priority so switching apps or locking the
 * screen does not intentionally tear down that in-flight generation.
 */
public final class GenerationService extends Service {
    public static final String ACTION_START = "com.sulzhu.aihome.generation.START";
    public static final String ACTION_STOP = "com.sulzhu.aihome.generation.STOP";
    private static final int FOREGROUND_ID = 73001;
    private PowerManager.WakeLock wakeLock;

    private void acquireWakeLock() {
        try {
            if (wakeLock == null) return;
            if (!wakeLock.isHeld()) wakeLock.acquire();
        } catch (Exception ignored) { }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) { }
    }

    @Override public void onCreate() {
        super.onCreate();
        SystemNotifier.ensureGenerationChannel(this);
        // 锁屏后 CPU 可能休眠：partial wake lock 只阻止深度休眠，不点亮屏幕、不改后台网络架构。
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "aihome:generation");
                wakeLock.setReferenceCounted(false);
            }
        } catch (Exception ignored) { }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? "" : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            releaseWakeLock();
            stopForeground(true);
            stopSelf();
            Log.i("AiHome:gen", "fgs_stopped");
            return START_NOT_STICKY;
        }
        String assistant = intent == null ? "" : intent.getStringExtra("assistantName");
        if (assistant == null || assistant.trim().isEmpty()) assistant = "栖间";
        Notification n = new NotificationCompat.Builder(this, SystemNotifier.GENERATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_aihome)
            .setContentTitle(assistant + " 正在回复")
            .setContentText("切到后台也会继续生成")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
        startForeground(FOREGROUND_ID, n);
        acquireWakeLock();
        // 真机证据：FGS 实际启动 / 停止。adb logcat -s AiHome:gen 可见。
        Log.i("AiHome:gen", "fgs_started assistant=" + assistant + " wakelock=" + (wakeLock != null && wakeLock.isHeld()));
        return START_REDELIVER_INTENT;
    }

    @Override public void onDestroy() {
        releaseWakeLock();
        stopForeground(true);
        super.onDestroy();
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }
}
