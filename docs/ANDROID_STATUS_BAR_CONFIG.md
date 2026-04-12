# Android 状态栏不沉浸配置指南

## 📋 概述

本指南说明如何在 EasyPocketMD 中实现 Android 状态栏不沉浸的效果，即保持状态栏可见且颜色与日/夜间模式主题保持一致。

## ✅ 已完成的修改

### 1. 前端代码修改 (index.html & CSS)

#### 删除的代码
- ❌ HTML 中的 `<div class="status-bar-placeholder" aria-hidden="true"></div>`
- ❌ CSS 中的 `.status-bar-placeholder` 样式类
- ❌ CSS 中的 `body.night-mode .status-bar-placeholder` 样式

#### 修改的代码
- ✅ `body` 添加 `padding-top: env(safe-area-inset-top)`
- ✅ 保留 viewport meta: `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">`

### 2. Android 原生配置

已创建以下文件：

```
src-tauri/gen/android/app/src/main/res/
├── values/
│   └── themes.xml (Light 模式)
└── values-night/
    └── themes.xml (Dark 模式)

src-tauri/gen/android/app/src/main/java/com/yhsun/md/
└── MainActivity.kt
```

#### themes.xml 配置说明

```xml
<item name="android:windowFullscreen">false</item>
<!-- 禁用全屏模式，允许状态栏显示 -->

<item name="android:windowTranslucentStatus">false</item>
<!-- 禁用半透明状态栏 -->

<item name="android:statusBarColor">@android:color/transparent</item>
<!-- 设置状态栏为透明，背景色由 Web 内容提供 -->
```

#### MainActivity.kt 配置说明

```kotlin
WindowCompat.setDecorFitsSystemWindows(window, true)
```

此设置确保应用内容不会延伸到系统栏（状态栏）后方，内容将自动避开状态栏区域。

## 🎨 效果说明

### 白天模式 (Light Mode)
- 状态栏显示 CSS 中定义的浅色渐变背景
- 状态栏图标颜色为深色（自动适配）

### 夜间模式 (Dark Mode)  
- 状态栏显示 CSS 中定义的黑色背景
- 状态栏图标颜色为浅色（自动适配）

## 🔄 构建与部署

### 第一次构建

```bash
# 初始化 Android 项目
npm run tauri:android:init

# 应用 Android 配置
bash scripts/apply-android-config.sh

# 构建 APK
npm run tauri:android:build --apk
```

### 后续构建注意事项

⚠️ **重要**：每次运行 `npm run tauri:android:build` 前，需要重新应用配置：

```bash
bash scripts/apply-android-config.sh
npm run tauri:android:build --apk
```

这是因为 Tauri 每次构建时都会重新生成 Android 项目文件。

### 自动化脚本

为了避免重复手动操作，可以在 `package.json` 中添加以下脚本：

```json
{
  "scripts": {
    "tauri:android:build": "bash scripts/apply-android-config.sh && tauri android build --apk"
  }
}
```

## 📱 CSS 中的关键设置

### body 样式
```css
body {
    padding-top: env(safe-area-inset-top);
    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}
```

### 夜间模式
```css
body.night-mode {
    background: #000000 !important;
}
```

body 的背景颜色会自动显示在状态栏区域，无需额外的占位符 DOM 元素。

## 🧪 测试建议

1. **在真机上测试**：
   - 切换日/夜间模式，观察状态栏颜色变化
   - 检查内容是否被状态栏覆盖
   - 验证时间/信号图标是否正常显示

2. **检查清单**：
   - [ ] 状态栏可见
   - [ ] 状态栏颜色与主题一致
   - [ ] 内容不被状态栏覆盖
   - [ ] 日/夜间模式切换时颜色正确变化
   - [ ] 系统状态图标清晰可见

## ❓ 常见问题

### Q: 状态栏仍然是沉浸式的怎么办？
A: 检查以下几点：
1. 确认 `WindowCompat.setDecorFitsSystemWindows(window, true)` 已设置
2. 检查 themes.xml 中 `android:windowFullscreen` 是否为 `false`
3. 重新构建应用并安装

### Q: 状态栏颜色与背景不匹配怎么办？
A: 
1. 确认 CSS 中 `body` 和 `body.night-mode` 的背景色正确
2. 检查 themes.xml 中 `android:statusBarColor` 是否为 `transparent`
3. 清理应用缓存后重新测试

### Q: 能否自定义状态栏颜色？
A: 可以，修改 themes.xml 中的 `android:statusBarColor`：
```xml
<item name="android:statusBarColor">#FF6B6B</item>
<!-- 设置为具体颜色而不是 transparent -->
```

## 📚 相关资源

- [Tauri 官方文档](https://v2.tauri.app/)
- [Android Material Design - Status Bar](https://m3.material.io/theme-builder)
- [WindowCompat API](https://developer.android.com/reference/androidx/core/view/WindowCompat)

## 📝 版本历史

- **v1.0** (2024): 初版配置
  - 删除手动 placeholder 方案
  - 实现标准 Edge-to-Edge 适配
  - 自动日/夜间模式适配
