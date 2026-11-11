package com.sulzhu.aihome;

import android.annotation.SuppressLint;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

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
}
