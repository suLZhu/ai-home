package com.sulzhu.aihome;

import android.content.res.Configuration;
import android.content.res.Resources;

import com.getcapacitor.BridgeActivity;

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
}
