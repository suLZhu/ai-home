package com.sulzhu.aihome;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

/**
 * 原生闹钟到点触发（App 可以完全没在前台、手机可以锁屏）。
 * 这里只负责：发一条系统通知 + 记下稳定 runId + 给重复任务续排下一次。
 * 模型生成 / 写入聊天仍由现有 /api/tasks/run 前台结算链路负责；
 * 同一 runId 已在原生投递集合里，App 恢复前台后不会再弹第二条通知。
 */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String raw = intent == null ? null : intent.getStringExtra(SystemAlarms.EXTRA_ITEM);
        if (raw == null || raw.isEmpty()) return;
        try {
            JSONObject item = new JSONObject(raw);
            String runId = item.optString("runId", "");
            if (runId.isEmpty()) return;
            String key = "task:" + runId;
            if (SystemStore.wasDelivered(context, key)) return; // 重复广播 / 重启重放

            String body = item.optString("body", "");
            String summary = body.length() > 110 ? body.substring(0, 110) + "…" : body;
            String assistantId = item.optString("assistantId", "");
            // 标题优先用助手名；缺省时回退任务名。头像来自渠道同步时缓存的本机数据。
            String title = item.optString("assistantName", "");
            if (title.isEmpty()) title = item.optString("title", "定时任务");
            JSONObject payload = new JSONObject()
                .put("key", key)
                .put("kind", "task")
                .put("channelId", item.optString("channelId", SystemNotifier.SYSTEM_CHANNEL_ID))
                .put("channelName", item.optString("channelName", SystemNotifier.SYSTEM_CHANNEL_NAME))
                .put("title", title)
                .put("avatar", SystemStore.avatarFor(context, assistantId))
                .put("body", body)
                .put("summary", summary)
                .put("at", System.currentTimeMillis())
                .put("assistantId", assistantId)
                .put("conversationId", item.optString("conversationId", ""))
                .put("runId", runId)
                .put("messageId", "");
            SystemNotifier.post(context, payload);
            SystemAlarms.scheduleNext(context, item);
        } catch (Exception ignored) { }
    }
}
