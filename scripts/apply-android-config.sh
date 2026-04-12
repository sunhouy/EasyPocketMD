#!/bin/bash
# Android 状态栏不沉浸配置应用脚本

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_RES_DIR="$PROJECT_ROOT/src-tauri/gen/android/app/src/main/res"
ANDROID_MANIFEST_PATH="$PROJECT_ROOT/src-tauri/gen/android/app/src/main/AndroidManifest.xml"
ANDROID_PACKAGE_NAME="$(node -e 'const fs = require("fs"); const path = require("path"); const configPath = path.join(process.argv[1], "src-tauri", "tauri.conf.json"); const config = JSON.parse(fs.readFileSync(configPath, "utf8")); const identifier = config.identifier || config.package?.identifier || config.tauri?.bundle?.identifier || "cn.yhsun.md"; process.stdout.write(identifier);' "$PROJECT_ROOT")"
ANDROID_GENERATED_DIR="$PROJECT_ROOT/src-tauri/gen/android/app/src/main/java/${ANDROID_PACKAGE_NAME//./\/}/generated"
TAURI_ACTIVITY_PATH="$ANDROID_GENERATED_DIR/TauriActivity.kt"

echo "🔧 正在应用 Android 状态栏配置..."

# 创建必要的目录
mkdir -p "$ANDROID_RES_DIR/values"
mkdir -p "$ANDROID_RES_DIR/values-night"
mkdir -p "$ANDROID_GENERATED_DIR"
# 复制 themes.xml (Light mode)
cat > "$ANDROID_RES_DIR/values/themes.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.TauriApp" parent="Theme.MaterialComponents.DayNight.NoActionBar">
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
    if grep -q 'android:windowSoftInputMode=' "$ANDROID_MANIFEST_PATH"; then
        sed -i -E 's/android:windowSoftInputMode="[^"]*"/android:windowSoftInputMode="adjustResize"/g' "$ANDROID_MANIFEST_PATH"
    else
        sed -i '0,/<activity /s/<activity /<activity android:windowSoftInputMode="adjustResize" /' "$ANDROID_MANIFEST_PATH"
    fi
    echo "✅ AndroidManifest.xml 已设置 windowSoftInputMode=adjustResize"
else
    echo "⚠️ AndroidManifest.xml 尚未生成，待 tauri android init 后会自动注入 adjustResize"
fi

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
echo "状态栏将保持可见，颜色与日/夜间模式主题保持一致。"
