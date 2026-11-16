package com.sulzhu.aihome;

import android.app.RemoteInput;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import org.json.JSONObject;

/**
 * 通知里的「浮窗回复」：系统在通知下方弹一个快速回复输入框，
 * 提交后把文字带回 App，由聊天页直接发送，不要求用户先打开 App 再手打。
 */
public final class QuickReplyReceiver extends BroadcastReceiver {
    static final String ACTION_QUICK_REPLY = "com.sulzhu.aihome.QUICK_REPLY";
    static final String KEY_REPLY = "quick_reply";

    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        CharSequence raw = results == null ? null : results.getCharSequence(KEY_REPLY);
        String text = raw == null ? "" : raw.toString().trim();
        if (text.isEmpty()) return;

        String assistantId = intent.getStringExtra("assistantId");
        String conversationId = intent.getStringExtra("conversationId");
        try {
            JSONObject payload = new JSONObject();
            payload.put("assistantId", assistantId == null ? "" : assistantId);
            payload.put("conversationId", conversationId == null ? "" : conversationId);
            payload.put("quickReply", text);
            Intent open = new Intent(context, MainActivity.class);
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            open.putExtra(SystemNotifier.EXTRA_FROM_NOTIFICATION, true);
            open.putExtra(SystemNotifier.EXTRA_PAYLOAD, payload.toString());
            context.startActivity(open);
        } catch (Exception ignored) { }
    }
}
