#!/bin/bash
# Android 状态栏不沉浸配置应用脚本

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_RES_DIR="$PROJECT_ROOT/src-tauri/gen/android/app/src/main/res"
ANDROID_MANIFEST_PATH="$PROJECT_ROOT/src-tauri/gen/android/app/src/main/AndroidManifest.xml"
ANDROID_STRINGS_DIR="$ANDROID_RES_DIR/values"
ANDROID_STRINGS_PATH="$ANDROID_STRINGS_DIR/strings.xml"
ANDROID_PACKAGE_NAME="$(node -e 'const fs = require("fs"); const path = require("path"); const configPath = path.join(process.argv[1], "src-tauri", "tauri.conf.json"); const config = JSON.parse(fs.readFileSync(configPath, "utf8")); const identifier = config.identifier || config.package?.identifier || config.tauri?.bundle?.identifier || "cn.yhsun.md"; process.stdout.write(identifier);' "$PROJECT_ROOT")"
ANDROID_MAIN_DIR="$PROJECT_ROOT/src-tauri/gen/android/app/src/main/java/${ANDROID_PACKAGE_NAME//./\/}"
MAIN_ACTIVITY_PATH="$ANDROID_MAIN_DIR/MainActivity.kt"
ANDROID_GENERATED_DIR="$PROJECT_ROOT/src-tauri/gen/android/app/src/main/java/${ANDROID_PACKAGE_NAME//./\/}/generated"
TAURI_ACTIVITY_PATH="$ANDROID_GENERATED_DIR/TauriActivity.kt"

echo "🔧 正在应用 Android 状态栏配置..."

# 创建必要的目录
mkdir -p "$ANDROID_RES_DIR/values"
mkdir -p "$ANDROID_RES_DIR/values-night"
mkdir -p "$ANDROID_MAIN_DIR"
mkdir -p "$ANDROID_GENERATED_DIR"

cat > "$ANDROID_STRINGS_PATH" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">EasyPocketMD</string>
</resources>
EOF

echo "✅ strings.xml 已应用"

# 复制 themes.xml (Light mode)
cat > "$ANDROID_RES_DIR/values/themes.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.TauriApp" parent="Theme.MaterialComponents.DayNight.NoActionBar">
        <!-- 禁用边缘到边缘 cutout 扩展，避免与 adjustResize 冲突 -->
        <item name="android:windowLayoutInDisplayCutoutMode">default</item>
        <!-- 明确键盘弹出时收缩内容区域 -->
        <item name="android:windowSoftInputMode">adjustResize</item>
        <!-- 禁用全屏模式 -->
        <item name="android:windowFullscreen">false</item>
        <!-- 禁用半透明状态栏 -->
        <item name="android:windowTranslucentStatus">false</item>
        <!-- 设置状态栏颜色为透明，让系统布局扩展到状态栏 -->
        <item name="android:statusBarColor">@android:color/transparent</item>
        <!-- Light status bar content (for light background) -->
        <item name="android:windowLightStatusBar">false</item>
    </style>

    <!-- Tauri generated manifest may reference this style name -->
    <style name="Theme.easypocketmd_tauri" parent="Theme.TauriApp" />
</resources>
EOF

echo "✅ Light mode themes.xml 已应用"

# 复制 themes.xml (Dark mode)
cat > "$ANDROID_RES_DIR/values-night/themes.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.TauriApp" parent="Theme.MaterialComponents.DayNight.NoActionBar">
        <!-- 禁用边缘到边缘 cutout 扩展，避免与 adjustResize 冲突 -->
        <item name="android:windowLayoutInDisplayCutoutMode">default</item>
        <!-- 明确键盘弹出时收缩内容区域 -->
        <item name="android:windowSoftInputMode">adjustResize</item>
        <!-- 禁用全屏模式 -->
        <item name="android:windowFullscreen">false</item>
        <!-- 禁用半透明状态栏 -->
        <item name="android:windowTranslucentStatus">false</item>
        <!-- 设置状态栏颜色为透明，让系统布局扩展到状态栏 -->
        <item name="android:statusBarColor">@android:color/transparent</item>
        <!-- Dark status bar content (for dark background) -->
        <item name="android:windowLightStatusBar">false</item>
    </style>

    <!-- Tauri generated manifest may reference this style name -->
    <style name="Theme.easypocketmd_tauri" parent="Theme.TauriApp" />
</resources>
EOF

echo "✅ Dark mode themes.xml 已应用"

# 为软键盘弹出启用 adjustResize（底部工具栏自动顶到键盘上方）
if [ -f "$ANDROID_MANIFEST_PATH" ]; then
        cat > "$ANDROID_MANIFEST_PATH" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:theme="@style/Theme.TauriApp">
        <activity
            android:name="cn.yhsun.md.MainActivity"
            android:exported="true"
            android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize"
            android:configChanges="orientation|keyboardHidden|screenSize|smallestScreenSize|screenLayout|uiMode|density">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
EOF

        echo "✅ AndroidManifest.xml 已应用启动器与 adjustResize 配置"
else
    echo "⚠️ AndroidManifest.xml 尚未生成，待 tauri android init 后会自动注入 adjustResize"
fi

cat > "$MAIN_ACTIVITY_PATH" << EOF
package $ANDROID_PACKAGE_NAME

import android.os.Bundle
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val rootView = window.decorView.findViewById<android.view.View>(android.R.id.content)

        ViewCompat.setOnApplyWindowInsetsListener(rootView) { view, insets ->
            val imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime())
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())

            view.updatePadding(
                bottom = if (imeInsets.bottom > 0) imeInsets.bottom else systemBars.bottom
            )
            insets
        }
    }
}
EOF

echo "✅ MainActivity.kt 已同步输入法/窗口配置"

cat > "$TAURI_ACTIVITY_PATH" << EOF
// Copyright 2019-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

/* THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!! */

package $ANDROID_PACKAGE_NAME

import android.content.Intent
import android.content.res.Configuration
import app.tauri.plugin.PluginManager
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner

object TauriLifecycleObserver : DefaultLifecycleObserver {
        override fun onResume(owner: LifecycleOwner) {
            super.onResume(owner)
            PluginManager.onResume()
        }

        override fun onPause(owner: LifecycleOwner) {
            super.onPause(owner)
            PluginManager.onPause()
        }

        override fun onStop(owner: LifecycleOwner) {
            super.onStop(owner)
            PluginManager.onStop()
        }
}

abstract class TauriActivity : WryActivity() {
    override val handleBackNavigation: Boolean = false

    fun getPluginManager(): PluginManager {
        return PluginManager
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        PluginManager.onNewIntent(intent)
    }

    override fun onRestart() {
        super.onRestart()
        PluginManager.onRestart(this)
    }

    override fun onDestroy() {
        super.onDestroy()
        PluginManager.onDestroy(this)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        PluginManager.onConfigurationChanged(newConfig)
    }
}
EOF

echo ""
echo "✨ Android 状态栏配置应用完成！"
echo "状态栏将保持可见，颜色与日/夜间模式主题保持一致"