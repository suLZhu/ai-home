package com.sulzhu.aihome;

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Keeps an in-flight assistant generation alive when the WebView is backgrounded.
 * The actual HTTP/SSE worker is attached to this service in the next step; this
 * first layer deliberately owns process priority independently from MainActivity.
 */
public final class GenerationService extends Service {
    public static final String ACTION_START = "com.sulzhu.aihome.generation.START";
    public static final String ACTION_STOP = "com.sulzhu.aihome.generation.STOP";
    private static final int FOREGROUND_ID = 73001;

    @Override public void onCreate() {
        super.onCreate();
        SystemNotifier.ensureGenerationChannel(this);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? "" : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopForeground(true);
            stopSelf();
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
        return START_REDELIVER_INTENT;
    }

    @Override public void onDestroy() {
        stopForeground(true);
        super.onDestroy();
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }
}
