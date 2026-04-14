#!/bin/bash
# Configure Android permissions for EasyPocketMD
# Adds camera, microphone, and file access permissions

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST_PATH="$PROJECT_ROOT/src-tauri/gen/android/app/src/main/AndroidManifest.xml"

echo "🔐 正在配置 Android 权限..."

# Check if AndroidManifest.xml exists
if [ ! -f "$MANIFEST_PATH" ]; then
    echo "⚠️  AndroidManifest.xml 不存在于 $MANIFEST_PATH"
    echo "   这在第一次初始化后会由 Tauri 生成。"
    echo "   跳过权限配置，将在下次构建时应用。"
    exit 0
fi

# 权限列表
PERMISSIONS=(
    "android.permission.INTERNET"
    "android.permission.CAMERA"
    "android.permission.RECORD_AUDIO"
    "android.permission.READ_EXTERNAL_STORAGE"
    "android.permission.WRITE_EXTERNAL_STORAGE"
    "android.permission.MANAGE_EXTERNAL_STORAGE"
)

# 使用 sed 来添加权限（在 </manifest> 之前）
# 注意：我们需要读取文件，检查权限是否已存在，然后添加缺失的权限

# 创建临时文件
TEMP_MANIFEST=$(mktemp)

# 读取现有内容
cat "$MANIFEST_PATH" > "$TEMP_MANIFEST"

# 检查并添加缺失的权限
for perm in "${PERMISSIONS[@]}"; do
    if ! grep -q "android:name=\"$perm\"" "$TEMP_MANIFEST"; then
        # 在 </manifest> 之前插入权限声明
        sed -i "/<\/manifest>/i\\    <uses-permission android:name=\"$perm\" />" "$TEMP_MANIFEST"
        echo "✅ 已添加权限: $perm"
    else
        echo "⏭️  权限已存在: $perm"
    fi
done

# 将修改写回原文件
mv "$TEMP_MANIFEST" "$MANIFEST_PATH"

echo ""
echo "✨ Android 权限配置完成！"
echo "已添加的权限:"
echo "  • 🌐 INTERNET - 网络访问"
echo "  • 📷 CAMERA - 摄像头访问"
echo "  • 🎤 RECORD_AUDIO - 麦克风访问"  
echo "  • 📁 READ_EXTERNAL_STORAGE - 读取外部存储"
echo "  • 📝 WRITE_EXTERNAL_STORAGE - 写入外部存储"
echo "  • 📂 MANAGE_EXTERNAL_STORAGE - 管理所有文件"
echo ""
echo "注意: 应用运行时仍需要向用户请求这些权限。"
echo "请确保在 JavaScript 代码中实现运行时权限请求。"
