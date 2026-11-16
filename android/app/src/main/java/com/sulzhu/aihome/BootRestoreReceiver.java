package com.sulzhu.aihome;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONArray;

/**
 * 开机 / 应用更新 / 系统时间变更后恢复仍有效的定时主动任务。
 * 只从本机持久化快照恢复，且 SystemAlarms.filter() 会跳过已完成、已暂停、
 * 已投递和过期太久的一次性任务；register() 先 cancel 同 requestCode 再 set，
 * 因此不会因为多次 BOOT_COMPLETED 而重复注册或执行两次。
 */
public class BootRestoreReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (action == null) return;
        // 不处理 LOCKED_BOOT_COMPLETED：用户未解锁时凭据加密存储不可读，
        // 强行恢复会读不到计划；等解锁后的 BOOT_COMPLETED 再恢复，避免重放。
        boolean match = Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            || Intent.ACTION_TIME_CHANGED.equals(action)
            || Intent.ACTION_TIMEZONE_CHANGED.equals(action);
        if (!match) return;
        // 渠道必须在发第一条通知之前存在，否则 Android 8+ 会直接丢弃通知。
        SystemNotifier.ensureChannels(context, new JSONArray());
        SystemAlarms.restore(context);
        SystemStore.markRestored(context);
    }
}
