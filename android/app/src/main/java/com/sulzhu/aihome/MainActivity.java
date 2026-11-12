package com.sulzhu.aihome;

import android.annotation.SuppressLint;
import android.app.Dialog;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {
    // Android 系统「字体大小 / 显示大小」会传导进 WebView，把页面里所有 CSS px
    // 一起放大，聊天一句话没几个字就换行。App 自带 --font-scale 与密度适配规则，
    // 这里把本 Activity 的 fontScale 固定为 1，让任何系统字体设置下排版都一致。
    // 用 createConfigurationContext 而非已废弃的 Resources.updateConfiguration，
    // 只影响本 Activity 的 Context，不改系统或其它 App。
    @Override
    public Resources getResources() {
        Resources res = super.getResources();
        Configuration config = new Configuration(res.getConfiguration());
        if (config.fontScale == 1.0f) return res;
        config.fontScale = 1.0f;
        return createConfigurationContext(config).getResources();
    }

    // ── 全面屏（edge-to-edge）──────────────────────────────────────────────
    // 状态栏 / 手势条透明，内容延伸到系统区域后面；真实 inset 由 Java 量出来后
    // 写成 CSS 变量 --native-safe-top / --native-safe-bottom，前端用它们把顶栏和
    // 输入区避开系统栏。原因：Android WebView 的 env(safe-area-inset-*) 在无刘海
    // 机型上常返回 0，只靠 viewport-fit=cover 会让内容被状态栏压住。
    private int safeTopDp = 0;
    private int safeBottomDp = 0;

    // ── 账号登录：App 内可控 WebView ────────────────────────────────────────
    // 官方 Codex / Claude Code OAuth 的回调是 http://localhost:1455/auth/callback
    // 这类「桌面 CLI 的本地端口」。手机没有那个服务，用系统浏览器打开必然报
    // ERR_CONNECTION_REFUSED。这里改为在 App 内 WebView 打开授权页，并在导航到
    // 回调地址时直接拦下来取 code，再用原生 HttpURLConnection 换成令牌（不受 CORS
    // 限制）。用户点一下「登录」，登录完自动回到 App，不用填网址也不用复制地址。
    private Dialog oauthDialog;
    private boolean oauthHandled = false;
    private final ExecutorService oauthExecutor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupEdgeToEdge();
    }

    @Override
    public void onResume() {
        super.onResume();
        // 从后台回来 / 切主题后重新灌一次，防止页面重建丢失内联变量。
        injectSafeArea();
    }

    @SuppressLint("AddJavascriptInterface")
    private void setupEdgeToEdge() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        // 键盘用 resize 而不是 pan：pan 会把整张聊天页往上推，消息列表直接滚出屏幕；
        // resize 让 WebView 真正变矮，前端 visualViewport 才能把输入框压到键盘上沿。
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        View decor = window.getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            float density = getResources().getDisplayMetrics().density;
            safeTopDp = Math.round(bars.top / density);
            safeBottomDp = Math.round(bars.bottom / density);
            injectSafeArea();
            return insets;
        });

        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        // 前端可随时按主题切换系统栏图标明暗（夜间主题要亮色图标）。
        webView.addJavascriptInterface(new BarBridge(), "AiHomeBars");
        // 账号登录弹层：只对主 WebView 注入；授权页跑在另一个独立 WebView 里。
        webView.addJavascriptInterface(new OAuthBridge(), "AiHomeOAuth");
        // 页面每次加载完成都补一次变量，避免首次 insets 回调早于文档创建。
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                view.post(() -> injectSafeArea());
            }
        });
    }

    private void injectSafeArea() {
        WebView webView = (getBridge() != null) ? getBridge().getWebView() : null;
        if (webView == null) return;
        String js = "(function(){var r=document.documentElement;if(!r)return;"
            + "r.style.setProperty('--native-safe-top','" + safeTopDp + "px');"
            + "r.style.setProperty('--native-safe-bottom','" + safeBottomDp + "px');})();";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private void setDarkBarIcons(boolean darkIcons) {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller == null) return;
            int flags = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            controller.setSystemBarsAppearance(darkIcons ? flags : 0, flags);
            return;
        }
        View decor = window.getDecorView();
        int vis = decor.getSystemUiVisibility();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            int light = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            vis = darkIcons ? (vis | light) : (vis & ~light);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            vis = darkIcons
                ? (vis | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR)
                : (vis & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
        decor.setSystemUiVisibility(vis);
    }

    /** 只暴露给本 App 的 WebView：切换系统栏图标明暗，不读取任何数据。 */
    private class BarBridge {
        @JavascriptInterface
        public void setDarkIcons(final boolean darkIcons) {
            runOnUiThread(() -> setDarkBarIcons(darkIcons));
        }
    }

    /** 账号登录：前端把授权页 / 回调前缀 / 换令牌参数一次性传进来。 */
    private class OAuthBridge {
        @JavascriptInterface
        public void login(final String configJson) {
            runOnUiThread(() -> openOAuthDialog(configJson));
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void openOAuthDialog(String configJson) {
        try {
            if (oauthDialog != null && oauthDialog.isShowing()) oauthDialog.dismiss();
            oauthDialog = null;
            final JSONObject cfg = new JSONObject(configJson);
            final String url = cfg.optString("url", "");
            if (url.isEmpty()) { deliverOAuth(oauthError("登录地址为空")); return; }
            oauthHandled = false;

            Dialog dialog = new Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
            Window win = dialog.getWindow();
            if (win != null) {
                win.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
                win.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.WHITE));
                win.setStatusBarColor(Color.WHITE);
            }

            LinearLayout root = new LinearLayout(this);
            root.setOrientation(LinearLayout.VERTICAL);
            root.setBackgroundColor(Color.WHITE);

            LinearLayout bar = new LinearLayout(this);
            bar.setOrientation(LinearLayout.HORIZONTAL);
            bar.setPadding(dp(18), dp(14), dp(18), dp(12));
            bar.setBackgroundColor(Color.WHITE);
            TextView title = new TextView(this);
            title.setText("账号登录");
            title.setTextSize(17);
            title.setTextColor(Color.parseColor("#403b35"));
            title.setGravity(android.view.Gravity.CENTER);
            bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            TextView close = new TextView(this);
            close.setText("×");
            close.setTextSize(24);
            close.setTextColor(Color.parseColor("#8a8378"));
            close.setPadding(dp(12), 0, 0, 0);
            close.setOnClickListener(v -> cancelOAuth("已取消登录"));
            bar.addView(close, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

            WebView oauthView = new WebView(this);
            WebSettings s = oauthView.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setDatabaseEnabled(true);
            s.setJavaScriptCanOpenWindowsAutomatically(true);
            s.setSupportMultipleWindows(false);
            s.setLoadWithOverviewMode(true);
            s.setUseWideViewPort(true);
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
            // 官方授权页对移动端内嵌 WebView 的 UA 更挑剔，用桌面 Chrome UA。
            s.setUserAgentString("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                + "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
            CookieManager.getInstance().setAcceptThirdPartyCookies(oauthView, true);
            oauthView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    return maybeCallback(request.getUrl().toString(), cfg);
                }

                @SuppressWarnings("deprecation")
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, String u) {
                    return maybeCallback(u, cfg);
                }

                @Override
                public void onPageStarted(WebView view, String u, Bitmap favicon) {
                    maybeCallback(u, cfg);
                }
            });
            oauthView.loadUrl(url);

            root.addView(bar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            root.addView(oauthView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
            dialog.setContentView(root);
            dialog.setOnCancelListener(d -> cancelOAuth("已取消登录"));
            oauthDialog = dialog;
            dialog.show();
        } catch (Exception e) {
            deliverOAuth(oauthError("登录页打开失败：" + safeMessage(e)));
        }
    }

    /** 命中回调前缀就永远拦住，绝不让 WebView 真的去连 localhost:1455。 */
    private boolean maybeCallback(String u, JSONObject cfg) {
        if (u == null || !isCallback(u, cfg)) return false;
        if (!oauthHandled) handleOAuthCallback(u, cfg);
        return true;
    }

    private boolean isCallback(String u, JSONObject cfg) {
        JSONArray arr = cfg.optJSONArray("callbackPrefixes");
        if (arr == null) return false;
        for (int i = 0; i < arr.length(); i++) {
            String prefix = arr.optString(i, "");
            if (!prefix.isEmpty() && u.startsWith(prefix)) return true;
        }
        return false;
    }

    private void handleOAuthCallback(String u, JSONObject cfg) {
        if (oauthHandled) return;
        oauthHandled = true;
        try {
            Uri uri = Uri.parse(u);
            String err = uri.getQueryParameter("error");
            if (err != null && !err.isEmpty()) { deliverOAuth(oauthError("授权未完成：" + err)); return; }
            String expected = cfg.optString("state", "");
            String state = uri.getQueryParameter("state");
            if (!expected.isEmpty() && state != null && !state.isEmpty() && !expected.equals(state)) {
                deliverOAuth(oauthError("state 校验失败，请重新登录"));
                return;
            }
            String token = uri.getQueryParameter("access_token");
            if (token == null || token.isEmpty()) token = fragmentParam(uri.getFragment(), "access_token");
            if (token != null && !token.isEmpty()) { deliverOAuth(oauthOk(token, "", 0)); return; }
            String code = uri.getQueryParameter("code");
            if (code == null || code.isEmpty()) code = fragmentParam(uri.getFragment(), "code");
            if (code == null || code.isEmpty()) { deliverOAuth(oauthError("没有拿到授权码，请重新登录")); return; }
            final String tokenUrl = cfg.optString("tokenUrl", "");
            if (tokenUrl.isEmpty()) {
                deliverOAuth(oauthError("官方没有回传可用令牌，这个渠道暂时无法自动登录"));
                return;
            }
            JSONObject body = cfg.optJSONObject("tokenBody");
            if (body == null) body = new JSONObject();
            body.put("code", code);
            if (!expected.isEmpty()) body.put("state", expected);
            final String bodyJson = body.toString();
            final JSONObject headers = cfg.optJSONObject("tokenHeaders");
            oauthExecutor.execute(() -> exchangeToken(tokenUrl, bodyJson, headers));
        } catch (Exception e) {
            deliverOAuth(oauthError("回调解析失败：" + safeMessage(e)));
        }
    }

    private String fragmentParam(String fragment, String key) {
        if (fragment == null || fragment.isEmpty()) return "";
        for (String part : fragment.split("&")) {
            int i = part.indexOf('=');
            if (i > 0 && key.equals(part.substring(0, i))) return Uri.decode(part.substring(i + 1));
        }
        return "";
    }

    /** 原生发 POST，不受 WebView CORS 限制。 */
    private void exchangeToken(String tokenUrl, String bodyJson, JSONObject headers) {
        HttpURLConnection conn = null;
        try {
            URL u = new URL(tokenUrl);
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");
            if (headers != null) {
                Iterator<String> it = headers.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    conn.setRequestProperty(k, headers.optString(k, ""));
                }
            }
            byte[] out = bodyJson.getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(out.length);
            try (OutputStream os = conn.getOutputStream()) { os.write(out); }
            int status = conn.getResponseCode();
            InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            String text = readAll(in);
            if (status < 200 || status >= 300) {
                deliverOAuth(oauthError("令牌接口 HTTP " + status + " · "
                    + text.substring(0, Math.min(120, text.length()))));
                return;
            }
            JSONObject data = new JSONObject(text);
            String token = data.optString("access_token", "");
            if (token.isEmpty()) token = data.optString("token", "");
            if (token.isEmpty()) { deliverOAuth(oauthError("令牌接口没有返回 access_token")); return; }
            deliverOAuth(oauthOk(token, data.optString("refresh_token", ""), data.optLong("expires_in", 0)));
        } catch (Exception e) {
            deliverOAuth(oauthError("换取令牌失败：" + safeMessage(e)));
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private String readAll(InputStream in) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        try (InputStream src = in) {
            while ((n = src.read(buf)) > 0) bos.write(buf, 0, n);
        }
        return new String(bos.toByteArray(), StandardCharsets.UTF_8);
    }

    private void cancelOAuth(String message) {
        if (oauthHandled) return;
        oauthHandled = true;
        deliverOAuth(oauthError(message));
    }

    private void deliverOAuth(final String json) {
        runOnUiThread(() -> {
            if (oauthDialog != null) {
                try { oauthDialog.dismiss(); } catch (Exception ignored) { }
                oauthDialog = null;
            }
            WebView main = (getBridge() != null) ? getBridge().getWebView() : null;
            if (main == null) return;
            main.evaluateJavascript("window.__aihomeOAuthResult && window.__aihomeOAuthResult("
                + JSONObject.quote(json) + ")", null);
        });
    }

    private String oauthError(String message) {
        try { return new JSONObject().put("ok", false).put("error", message).toString(); }
        catch (Exception e) { return "{\"ok\":false,\"error\":\"登录失败\"}"; }
    }

    private String oauthOk(String token, String refresh, long expires) {
        try {
            return new JSONObject().put("ok", true).put("token", token)
                .put("refreshToken", refresh).put("expiresIn", expires).toString();
        } catch (Exception e) { return oauthError("登录结果生成失败"); }
    }

    private String safeMessage(Exception e) {
        String m = e.getMessage();
        return m == null || m.isEmpty() ? "未知错误" : m;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
