package com.sulzhu.aihome;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.provider.Settings;
import android.text.TextUtils;

import org.json.JSONArray;
import org.json.JSONObject;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 应用锁的本机存储：锁定名单、PIN 哈希、临时解锁时间。 */
final class AppLockStore {
    private static final String PREFS = "aihome.applock";
    private static final String KEY_LOCKED = "locked";
    private static final String KEY_PIN = "pinHash";
    private static final String KEY_SALT = "pinSalt";

    private AppLockStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static Set<String> locked(Context c) {
        Set<String> out = new HashSet<>();
        try {
            JSONArray arr = new JSONArray(prefs(c).getString(KEY_LOCKED, "[]"));
            for (int i = 0; i < arr.length(); i++) out.add(arr.optString(i));
        } catch (Exception ignored) { }
        return out;
    }

    private static void persistLocked(Context c, Set<String> set) {
        JSONArray arr = new JSONArray();
        for (String s : set) arr.put(s);
        prefs(c).edit().putString(KEY_LOCKED, arr.toString()).apply();
    }

    static void setLocked(Context c, String pkg, boolean locked) {
        if (TextUtils.isEmpty(pkg) || c.getPackageName().equals(pkg)) return;
        Set<String> set = locked(c);
        if (locked) set.add(pkg); else set.remove(pkg);
        persistLocked(c, set);
    }

    static boolean isLocked(Context c, String pkg) {
        return !TextUtils.isEmpty(pkg) && locked(c).contains(pkg);
    }

    static boolean hasPin(Context c) {
        return !TextUtils.isEmpty(prefs(c).getString(KEY_PIN, ""));
    }

    static boolean setPin(Context c, String pin) {
        if (pin == null) return false;
        String p = pin.trim();
        if (p.length() < 4 || p.length() > 32) return false;
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        String saltHex = hex(salt);
        prefs(c).edit().putString(KEY_SALT, saltHex).putString(KEY_PIN, hash(saltHex, p)).apply();
        return true;
    }

    static boolean verifyPin(Context c, String pin) {
        String salt = prefs(c).getString(KEY_SALT, "");
        String saved = prefs(c).getString(KEY_PIN, "");
        if (TextUtils.isEmpty(salt) || TextUtils.isEmpty(saved) || pin == null) return false;
        return saved.equals(hash(salt, pin.trim()));
    }

    /** 临时解锁到期时间（毫秒），0 表示没有临时解锁。 */
    static long unlockedUntil(Context c, String pkg) {
        return prefs(c).getLong("unlock." + pkg, 0L);
    }

    static void unlockFor(Context c, String pkg, long durationMs) {
        prefs(c).edit().putLong("unlock." + pkg, System.currentTimeMillis() + durationMs).apply();
    }

    /** 无障碍服务是否已在系统设置里启用。 */
    static boolean accessibilityEnabled(Context c) {
        try {
            String enabled = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            if (enabled == null) return false;
            String target = c.getPackageName() + "/" + AppLockService.class.getName();
            String targetShort = c.getPackageName() + "/.AppLockService";
            return enabled.contains(target) || enabled.contains(targetShort);
        } catch (Exception e) {
            return false;
        }
    }

    static void openAccessibilitySettings(Context c) {
        try {
            Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (Exception ignored) { }
    }

    /** 有启动入口的应用（不含自己），带显示名与是否锁定。 */
    static JSONArray apps(Context c) {
        JSONArray out = new JSONArray();
        try {
            PackageManager pm = c.getPackageManager();
            Intent launch = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> list = pm.queryIntentActivities(launch, 0);
            Set<String> seen = new HashSet<>();
            List<JSONObject> rows = new ArrayList<>();
            Set<String> lockedSet = locked(c);
            for (ResolveInfo ri : list) {
                ApplicationInfo ai = ri.activityInfo == null ? null : ri.activityInfo.applicationInfo;
                if (ai == null) continue;
                String pkg = ai.packageName;
                if (pkg.equals(c.getPackageName()) || !seen.add(pkg)) continue;
                JSONObject row = new JSONObject();
                row.put("pkg", pkg);
                row.put("label", String.valueOf(pm.getApplicationLabel(ai)));
                row.put("locked", lockedSet.contains(pkg));
                rows.add(row);
            }
            Collections.sort(rows, new Comparator<JSONObject>() {
                @Override public int compare(JSONObject a, JSONObject b) {
                    return a.optString("label").compareToIgnoreCase(b.optString("label"));
                }
            });
            for (JSONObject row : rows) out.put(row);
        } catch (Exception ignored) { }
        return out;
    }

    static String hash(String saltHex, String pin) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update((saltHex + ":" + pin).getBytes("UTF-8"));
            return hex(md.digest());
        } catch (Exception e) {
            return "";
        }
    }

    static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
