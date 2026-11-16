package com.sulzhu.aihome;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

/**
 * 通知「浮窗回复」：真正弹出一个小的浮动输入窗，而不是只把通知展开。
 * 提交后把文字交给 MainActivity 的既有聊天链路发送。
 */
public final class QuickReplyActivity extends Activity {
    private EditText input;
    private String assistantId = "";
    private String conversationId = "";
    private String assistantName = "";

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        assistantId = value(getIntent().getStringExtra("assistantId"));
        conversationId = value(getIntent().getStringExtra("conversationId"));
        assistantName = value(getIntent().getStringExtra("assistantName"));
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE
            | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        float d = getResources().getDisplayMetrics().density;
        int pad = (int) (18 * d);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.rgb(253, 250, 246));
        bg.setCornerRadius(22 * d);
        bg.setStroke((int) d, Color.rgb(226, 216, 202));
        root.setBackground(bg);

        TextView title = new TextView(this);
        title.setText("回复 " + (assistantName.isEmpty() ? "栖间" : assistantName));
        title.setTextSize(16);
        title.setTextColor(Color.rgb(54, 48, 42));
        title.setPadding(0, 0, 0, (int) (10 * d));
        root.addView(title);

        input = new EditText(this);
        input.setHint("写点什么……");
        input.setTextSize(15);
        input.setMinLines(2);
        input.setMaxLines(5);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setPadding((int) (12 * d), (int) (10 * d), (int) (12 * d), (int) (10 * d));
        GradientDrawable inputBg = new GradientDrawable();
        inputBg.setColor(Color.WHITE);
        inputBg.setCornerRadius(12 * d);
        inputBg.setStroke((int) d, Color.rgb(226, 216, 202));
        input.setBackground(inputBg);
        root.addView(input, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.END);
        actions.setPadding(0, (int) (12 * d), 0, 0);
        Button cancel = new Button(this);
        cancel.setText("取消");
        cancel.setAllCaps(false);
        cancel.setTextColor(Color.rgb(120, 110, 100));
        cancel.setBackgroundColor(Color.TRANSPARENT);
        cancel.setOnClickListener(v -> finish());
        actions.addView(cancel);
        Button send = new Button(this);
        send.setText("发送");
        send.setAllCaps(false);
        send.setTextColor(Color.WHITE);
        GradientDrawable sendBg = new GradientDrawable();
        sendBg.setColor(Color.rgb(143, 113, 165));
        sendBg.setCornerRadius(18 * d);
        send.setBackground(sendBg);
        send.setPadding((int) (20 * d), 0, (int) (20 * d), 0);
        send.setOnClickListener(v -> send());
        actions.addView(send);
        root.addView(actions, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        setContentView(root);
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.width = (int) (340 * d);
        lp.height = ViewGroup.LayoutParams.WRAP_CONTENT;
        lp.gravity = Gravity.CENTER;
        getWindow().setAttributes(lp);
        input.requestFocus();
    }

    private static String value(String v) { return v == null ? "" : v; }

    private void send() {
        String text = input.getText().toString().trim();
        if (text.isEmpty()) return;
        try {
            JSONObject payload = new JSONObject();
            payload.put("assistantId", assistantId);
            payload.put("conversationId", conversationId);
            payload.put("quickReply", text);
            Intent open = new Intent(this, MainActivity.class);
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            open.putExtra(SystemNotifier.EXTRA_FROM_NOTIFICATION, true);
            open.putExtra(SystemNotifier.EXTRA_PAYLOAD, payload.toString());
            startActivity(open);
        } catch (Exception ignored) { }
        finish();
    }
}
