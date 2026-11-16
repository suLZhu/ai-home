package com.sulzhu.aihome;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.net.URL;

/**
 * App 内置浏览器（兜底）：当网页不允许被 iframe 内嵌时，用真正的 WebView 打开。
 * 自带返回、刷新、外部打开和关闭，用户随时可以退出回到房间。
 */
public class WebViewActivity extends Activity {
    private WebView webView;
    private ProgressBar progress;
    private TextView titleView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#FAF6EF"));
        window.setNavigationBarColor(Color.parseColor("#FAF6EF"));
        if (Build.VERSION.SDK_INT >= 23) {
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
        String url = getIntent() == null ? "" : getIntent().getStringExtra("url");
        String title = getIntent() == null ? "" : getIntent().getStringExtra("title");
        if (!isHttp(url)) { finish(); return; }
        build(url, title);
        if (webView != null) webView.loadUrl(url);
    }

    private static boolean isHttp(String value) {
        try {
            URL u = new URL(value == null ? "" : value);
            return "http".equalsIgnoreCase(u.getProtocol()) || "https".equalsIgnoreCase(u.getProtocol());
        } catch (Exception e) { return false; }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void build(String url, String title) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#FFFDF9"));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(8), dp(6), dp(8), dp(6));
        bar.setBackgroundColor(Color.parseColor("#FAF6EF"));

        TextView back = new TextView(this);
        back.setText("‹");
        back.setTextSize(26);
        back.setTextColor(Color.parseColor("#6F5F8F"));
        back.setGravity(Gravity.CENTER);
        back.setPadding(dp(10), 0, dp(10), dp(2));
        back.setOnClickListener(v -> { if (webView.canGoBack()) webView.goBack(); else finish(); });
        bar.addView(back);

        titleView = new TextView(this);
        titleView.setText(title == null || title.isEmpty() ? url : title);
        titleView.setTextSize(12);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setTextColor(Color.parseColor("#403B35"));
        titleView.setSingleLine(true);
        titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        titleParams.leftMargin = dp(2);
        bar.addView(titleView, titleParams);

        TextView external = new TextView(this);
        external.setText("↗");
        external.setTextSize(18);
        external.setTextColor(Color.parseColor("#6F5F8F"));
        external.setPadding(dp(10), 0, dp(10), 0);
        external.setOnClickListener(v -> {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(webView.getUrl()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception ignored) { }
        });
        bar.addView(external);

        TextView close = new TextView(this);
        close.setText("×");
        close.setTextSize(22);
        close.setTextColor(Color.parseColor("#81786D"));
        close.setPadding(dp(10), 0, dp(10), 0);
        close.setOnClickListener(v -> finish());
        bar.addView(close);
        root.addView(bar, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgress(0);
        progress.setVisibility(View.GONE);
        root.addView(progress, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(2)));

        FrameLayout frame = new FrameLayout(this);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        if (Build.VERSION.SDK_INT >= 21) settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String pageUrl) {
                if (titleView != null) {
                    String pageTitle = view.getTitle();
                    titleView.setText(pageTitle == null || pageTitle.isEmpty() ? pageUrl : pageTitle);
                }
                progress.setVisibility(View.GONE);
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int newProgress) {
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
                progress.setProgress(newProgress);
            }
        });
        frame.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.addView(frame, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            try { webView.stopLoading(); webView.destroy(); } catch (Exception ignored) { }
            webView = null;
        }
        super.onDestroy();
    }
}
