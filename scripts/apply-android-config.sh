#!/bin/bash
# Android 状态栏不沉浸配置应用脚本

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_RES_DIR="$PROJECT_ROOT/src-tauri/gen/android/app/src/main/res"
ANDROID_SRC_DIR="$PROJECT_ROOT/src-tauri/gen/android/app/src/main/java/cn/yhsun/md"
ANDROID_MANIFEST_PATH="$PROJECT_ROOT/src-tauri/gen/android/app/src/main/AndroidManifest.xml"

echo "🔧 正在应用 Android 状态栏配置..."

# 创建必要的目录
mkdir -p "$ANDROID_RES_DIR/values"
mkdir -p "$ANDROID_RES_DIR/values-night"
mkdir -p "$ANDROID_SRC_DIR"

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

# 复制 MainActivity.kt
cat > "$ANDROID_SRC_DIR/MainActivity.kt" << 'EOF'
package cn.yhsun.md

import android.os.Bundle
import app.tauri.TauriActivity

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 键盘适配由 AndroidManifest.xml 的 adjustResize 托管，
        // 避免引入额外 AndroidX 依赖导致 Kotlin 编译失败。
    }
}
EOF

echo "✅ MainActivity.kt 已应用"

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

echo ""
echo "✨ Android 状态栏配置应用完成！"
echo "状态栏将保持可见，颜色与日/夜间模式主题保持一致。"
