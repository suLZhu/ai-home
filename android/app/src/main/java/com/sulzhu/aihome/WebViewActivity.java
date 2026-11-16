package com.sulzhu.aihome;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.net.URL;

/**
 * App 内置浏览器（完整版）：
 * 地址栏、后退 / 前进 / 刷新 / 首页、下载、外部打开、进度条。
 * 由 openWebView(url, title) 拉起，也可以从系统 Intent 进入。
 */
public class WebViewActivity extends Activity {
    private WebView webView;
    private ProgressBar progress;
    private EditText address;
    private TextView backBtn, forwardBtn, titleView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#FAF6EF"));
        window.setNavigationBarColor(Color.parseColor("#FAF6EF"));
        if (Build.VERSION.SDK_INT >= 23) {
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
        Intent intent = getIntent();
        String url = intent == null ? "" : intent.getStringExtra("url");
        String title = intent == null ? "" : intent.getStringExtra("title");
        if (!isHttp(url)) { finish(); return; }
        build(url, title);
        webView.loadUrl(url);
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

    private TextView iconButton(String text, String desc, View.OnClickListener click) {
        TextView v = new TextView(this);
        v.setText(text);
        v.setTextSize(19);
        v.setTextColor(Color.parseColor("#6F5F8F"));
        v.setGravity(Gravity.CENTER);
        v.setContentDescription(desc);
        v.setPadding(dp(8), dp(8), dp(8), dp(8));
        v.setOnClickListener(click);
        return v;
    }

    private void build(String url, String title) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setFitsSystemWindows(true);
        root.setBackgroundColor(Color.parseColor("#FFFDF9"));

        // 第一行：关闭 / 地址栏 / 外部
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(8), dp(8), dp(8), dp(4));
        top.setBackgroundColor(Color.parseColor("#FAF6EF"));

        TextView close = iconButton("×", "关闭", v -> finish());
        top.addView(close);

        address = new EditText(this);
        address.setText(url);
        address.setTextSize(12);
        address.setSingleLine(true);
        address.setTextColor(Color.parseColor("#403B35"));
        address.setHint("输入网址或搜索");
        address.setHintTextColor(Color.parseColor("#A79D91"));
        address.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        GradientDrawable field = new GradientDrawable();
        field.setColor(Color.parseColor("#FFFFFF"));
        field.setCornerRadius(dp(16));
        field.setStroke(dp(1), Color.parseColor("#E6DED2"));
        address.setBackground(field);
        address.setPadding(dp(12), dp(6), dp(12), dp(6));
        LinearLayout.LayoutParams addrParams = new LinearLayout.LayoutParams(0, dp(38), 1f);
        addrParams.leftMargin = dp(6);
        addrParams.rightMargin = dp(6);
        top.addView(address, addrParams);
        address.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO) { openAddress(); return true; }
            return false;
        });

        TextView external = iconButton("↗", "在浏览器打开", v -> openExternal());
        top.addView(external);
        root.addView(top, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        // 第二行：导航 + 标题
        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER_VERTICAL);
        nav.setPadding(dp(6), 0, dp(6), dp(2));
        nav.setBackgroundColor(Color.parseColor("#FAF6EF"));

        backBtn = iconButton("‹", "后退", v -> { if (webView.canGoBack()) webView.goBack(); });
        forwardBtn = iconButton("›", "前进", v -> { if (webView.canGoForward()) webView.goForward(); });
        TextView refresh = iconButton("⟳", "刷新", v -> webView.reload());
        TextView home = iconButton("⌂", "回到首页", v -> webView.loadUrl(url));
        nav.addView(backBtn);
        nav.addView(forwardBtn);
        nav.addView(refresh);
        nav.addView(home);

        titleView = new TextView(this);
        titleView.setText(title == null || title.isEmpty() ? url : title);
        titleView.setTextSize(11);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setTextColor(Color.parseColor("#403B35"));
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        titleParams.leftMargin = dp(6);
        nav.addView(titleView, titleParams);
        root.addView(nav, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

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
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        if (Build.VERSION.SDK_INT >= 21) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }
        if (Build.VERSION.SDK_INT >= 21) CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        CookieManager.getInstance().setAcceptCookie(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String target) {
                if (target == null) return false;
                if (isHttp(target)) return false;
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(target));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String pageUrl, android.graphics.Bitmap favicon) {
                if (address != null && pageUrl != null) address.setText(pageUrl);
                updateNav();
            }

            @Override
            public void onPageFinished(WebView view, String pageUrl) {
                if (titleView != null) {
                    String pageTitle = view.getTitle();
                    titleView.setText(pageTitle == null || pageTitle.isEmpty() ? pageUrl : pageTitle);
                }
                if (address != null && pageUrl != null) address.setText(pageUrl);
                progress.setVisibility(View.GONE);
                updateNav();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
                progress.setProgress(newProgress);
            }

            @Override
            public void onReceivedTitle(WebView view, String pageTitle) {
                if (titleView != null && pageTitle != null && !pageTitle.isEmpty()) titleView.setText(pageTitle);
            }
        });

        webView.setDownloadListener((downloadUrl, userAgent, contentDisposition, mimeType, contentLength) -> startDownload(downloadUrl, userAgent, contentDisposition, mimeType));

        frame.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.addView(frame, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
    }

    private void updateNav() {
        if (backBtn != null) backBtn.setAlpha(webView != null && webView.canGoBack() ? 1f : 0.35f);
        if (forwardBtn != null) forwardBtn.setAlpha(webView != null && webView.canGoForward() ? 1f : 0.35f);
    }

    private void openAddress() {
        String input = address == null ? "" : address.getText().toString().trim();
        if (input.isEmpty()) return;
        if (!isHttp(input)) input = "https://" + input;
        if (!isHttp(input)) return;
        address.setText(input);
        webView.loadUrl(input);
    }

    private void openExternal() {
        if (webView == null) return;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(webView.getUrl()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception ignored) { }
    }

    private void startDownload(String downloadUrl, String userAgent, String contentDisposition, String mimeType) {
        try {
            if (downloadUrl == null || !isHttp(downloadUrl)) return;
            String fileName = URLUtil.guessFileName(downloadUrl, contentDisposition, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(downloadUrl));
            if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
            request.setMimeType(mimeType);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setTitle(fileName);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager != null) {
                manager.enqueue(request);
                Toast.makeText(this, "开始下载：" + fileName, Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Toast.makeText(this, "下载失败，可点右上角在浏览器打开", Toast.LENGTH_SHORT).show();
        }
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
