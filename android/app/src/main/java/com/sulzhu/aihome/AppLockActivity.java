package com.sulzhu.aihome;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/** 命中锁定应用时盖在最上面的解锁页：只接受本机 PIN。 */
public class AppLockActivity extends Activity {
    private String pkg = "";
    private EditText pin;
    private TextView error;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        pkg = getIntent() == null ? "" : String.valueOf(getIntent().getStringExtra("pkg"));
        String label;
        try {
            PackageManager pm = getPackageManager();
            label = String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)));
        } catch (Exception e) {
            label = pkg;
        }

        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#F5F1EA"));
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("应用已锁定");
        title.setTextSize(24);
        title.setTextColor(Color.parseColor("#2F2A25"));
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView sub = new TextView(this);
        sub.setText(label + "\n输入 PIN 继续");
        sub.setTextSize(14);
        sub.setTextColor(Color.parseColor("#7C7164"));
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(0, pad / 3, 0, pad / 2);
        root.addView(sub);

        pin = new EditText(this);
        pin.setHint("PIN");
        pin.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        pin.setGravity(Gravity.CENTER);
        pin.setMaxLines(1);
        LinearLayout.LayoutParams pinLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        root.addView(pin, pinLp);

        error = new TextView(this);
        error.setTextColor(Color.parseColor("#B4544C"));
        error.setGravity(Gravity.CENTER);
        error.setPadding(0, pad / 4, 0, 0);
        root.addView(error);

        Button unlock = new Button(this);
        unlock.setText("解锁");
        LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        btnLp.topMargin = pad / 2;
        root.addView(unlock, btnLp);
        unlock.setOnClickListener(v -> attempt());

        Button back = new Button(this);
        back.setText("退出到桌面");
        back.setOnClickListener(v -> { moveTaskToBack(true); });
        root.addView(back);

        if (!AppLockStore.hasPin(this)) {
            sub.setText(label + "\n还没有设置 PIN，请先回栖间设置");
            lockInputs();
        }

        setContentView(root);
        pin.requestFocus();
    }

    private void lockInputs() {
        pin.setEnabled(false);
    }

    private void attempt() {
        String value = pin.getText() == null ? "" : pin.getText().toString();
        if (AppLockStore.verifyPin(this, value)) {
            AppLockStore.unlockFor(this, pkg, 5 * 60 * 1000L);
            finish();
            return;
        }
        error.setText("PIN 不正确");
        pin.setText("");
    }

    @Override
    public void onBackPressed() {
        // 不允许用返回键绕过锁；只能解锁或回桌面。
    }
}
