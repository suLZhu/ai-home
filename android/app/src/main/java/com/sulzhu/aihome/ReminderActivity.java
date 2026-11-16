package com.sulzhu.aihome;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

/**
 * 到点提醒的全屏弹层：锁屏 / 息屏时由通知的 fullScreenIntent 拉起。
 * 只做一件事：展示任务标题和内容，给出「知道了」和「打开栖间」两个出口。
 * 不执行模型、不写数据，所有业务仍由 MainActivity / WebView 负责。
 */
public class ReminderActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            | WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        String raw = getIntent() == null ? null : getIntent().getStringExtra(SystemNotifier.EXTRA_PAYLOAD);
        String title = "定时提醒";
        String body = "";
        try {
            JSONObject payload = new JSONObject(raw == null ? "{}" : raw);
            title = payload.optString("title", title);
            body = payload.optString("body", "");
        } catch (Exception ignored) { }
        build(title, body, raw);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // 上一条提醒还开着时又来一条：直接重建，展示最新的任务内容。
        recreate();
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }

    private void build(String title, String body, String raw) {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#99201727"));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(22), dp(20), dp(22), dp(16));
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#FBF9FD"));
        cardBg.setCornerRadius(dp(22));
        cardBg.setStroke(dp(1), Color.parseColor("#E3DDD3"));
        card.setBackground(cardBg);

        TextView kicker = new TextView(this);
        kicker.setText("⏰ 到点提醒");
        kicker.setTextSize(12);
        kicker.setTextColor(Color.parseColor("#81786D"));
        card.addView(kicker);

        TextView titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextSize(20);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setTextColor(Color.parseColor("#403B35"));
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        titleParams.topMargin = dp(8);
        card.addView(titleView, titleParams);

        TextView bodyView = new TextView(this);
        bodyView.setText(body);
        bodyView.setTextSize(14);
        bodyView.setTextColor(Color.parseColor("#5D564E"));
        bodyView.setLineSpacing(dp(4), 1f);
        bodyView.setMaxLines(10);
        LinearLayout.LayoutParams bodyParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        bodyParams.topMargin = dp(10);
        card.addView(bodyView, bodyParams);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.END);
        LinearLayout.LayoutParams actionsParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionsParams.topMargin = dp(18);

        Button dismiss = new Button(this);
        dismiss.setText("知道了");
        dismiss.setAllCaps(false);
        dismiss.setTextSize(13);
        dismiss.setTextColor(Color.parseColor("#403B35"));
        GradientDrawable dismissBg = new GradientDrawable();
        dismissBg.setColor(Color.parseColor("#F4F0F6"));
        dismissBg.setCornerRadius(dp(999));
        dismissBg.setStroke(dp(1), Color.parseColor("#DDD5C7"));
        dismiss.setBackground(dismissBg);
        dismiss.setPadding(dp(18), dp(8), dp(18), dp(8));
        dismiss.setOnClickListener(v -> finish());
        actions.addView(dismiss);

        Button open = new Button(this);
        open.setText("打开栖间");
        open.setAllCaps(false);
        open.setTextSize(13);
        open.setTextColor(Color.parseColor("#FBF9FD"));
        GradientDrawable openBg = new GradientDrawable();
        openBg.setColor(Color.parseColor("#8A79AA"));
        openBg.setCornerRadius(dp(999));
        open.setBackground(openBg);
        open.setPadding(dp(18), dp(8), dp(18), dp(8));
        LinearLayout.LayoutParams openParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        openParams.leftMargin = dp(8);
        open.setOnClickListener(v -> {
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra(SystemNotifier.EXTRA_FROM_NOTIFICATION, true);
            if (raw != null) intent.putExtra(SystemNotifier.EXTRA_PAYLOAD, raw);
            try { startActivity(intent); } catch (Exception ignored) { }
            finish();
        });
        actions.addView(open, openParams);

        card.addView(actions, actionsParams);

        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        cardParams.gravity = Gravity.CENTER;
        cardParams.leftMargin = dp(24);
        cardParams.rightMargin = dp(24);
        root.addView(card, cardParams);
        setContentView(root);
    }
}
