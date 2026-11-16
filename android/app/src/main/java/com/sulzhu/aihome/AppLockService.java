package com.sulzhu.aihome;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.view.accessibility.AccessibilityEvent;

/** 只做前台应用监听：命中锁定名单就拉起解锁页，不模拟点击、不读屏内容。 */
public class AppLockService extends AccessibilityService {
    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence name = event.getPackageName();
        if (name == null) return;
        String pkg = name.toString();
        if (pkg.isEmpty()) return;
        if (getPackageName().equals(pkg)) return;
        if ("com.android.systemui".equals(pkg)) return;
        if (!AppLockStore.isLocked(this, pkg)) return;
        if (AppLockStore.unlockedUntil(this, pkg) > System.currentTimeMillis()) return;
        try {
            Intent i = new Intent(this, AppLockActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            i.putExtra("pkg", pkg);
            startActivity(i);
        } catch (Exception ignored) { }
    }

    @Override
    public void onInterrupt() { }
}
