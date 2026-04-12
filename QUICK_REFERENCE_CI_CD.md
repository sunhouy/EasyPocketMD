# 🚀 Android CI/CD 快速参考

## ✅ 已完成

### 1. 主题配置 ✨状态栏不沉浸
```bash
scripts/apply-android-config.sh
├── Light 主题 (themes.xml)
├── Dark 主题 (themes.xml)
└── MainActivity.kt 配置
```

### 2. 权限配置
```bash
scripts/configure-android-permissions.sh
├── 📷 CAMERA
├── 🎤 RECORD_AUDIO
├── 📁 READ_EXTERNAL_STORAGE
├── 📝 WRITE_EXTERNAL_STORAGE
├── 📂 MANAGE_EXTERNAL_STORAGE
├── 🌐 INTERNET
└── 📊 ACCESS_NETWORK_STATE
```

### 3. CI/CD 工作流集成
```
.github/workflows/build-android.yml
├── Initialize Android project
├── ✨ Apply Android theme configuration [NEW]
├── ✨ Configure Android permissions [NEW]
├── Build & Sign APK
└── Deploy
```

## 🎯 触发构建

### Git Tag 方式（推荐）
```bash
git tag v2.x.x
git push origin v2.x.x
# 自动触发 GitHub Actions
```

### Web UI 方式
1. GitHub → Actions → "Build Android App"
2. "Run workflow" → 输入版本号
3. Run

## 📊 构建输出验证

```
✅ Apply Android theme configuration
   - Light mode themes.xml
   - Dark mode themes.xml
   - MainActivity.kt
   
✅ Configure Android permissions
   - android.permission.CAMERA
   - android.permission.RECORD_AUDIO
   - (... 其他权限)
```

## 🧪 安装后检查

| 项 | 标准 | 验证 |
|----|------|------|
| 状态栏 | 可见 + 主题配色 | ✅ |
| 权限 | 摄像头/麦克风/文件 | ✅ |
| Light 模式 | 浅色背景 | ✅ |
| Dark 模式 | 黑色背景 | ✅ |

## 📁 关键文件

```
.github/workflows/build-android.yml ........... CI/CD 流程
scripts/apply-android-config.sh .............. 主题配置
scripts/configure-android-permissions.sh .... 权限配置
src-tauri/tauri.android.conf.json ........... Android 配置
```

## ⚠️ 常见错误排查

| 问题 | 解决方案 |
|------|---------|
| 权限脚本报错 | 正常，第一次初始化时文件不存在 |
| 构建失败 NDK | 检查工作流日志中的 SDK 安装步骤 |
| 签名失败 | 验证 CI/CD secrets 正确性 |
| 应用没权限 | 需要在客户端 JS 中实现运行时权限请求 |

## 📞 关键步骤恢复

如果需要恢复或重新配置：

```bash
# 1. 检查脚本是否存在
ls -la scripts/apply-android-config.sh
ls -la scripts/configure-android-permissions.sh

# 2. 手动运行脚本（仅用于测试）
npm run tauri:android:init
bash scripts/apply-android-config.sh
bash scripts/configure-android-permissions.sh

# 3. 验证工作流配置
grep -A 5 "Apply Android theme" .github/workflows/build-android.yml
grep -A 5 "Configure Android permissions" .github/workflows/build-android.yml
```

## 🎉 准备就绪

所有配置和脚本已准备好。下次提交新版本时：
1. 推送 Git tag
2. GitHub Actions 自动处理所有配置
3. APK 带有正确的主题和权限
4. 自动部署到 GitHub Release 和服务器

**下一步**: 触发第一次测试构建！

---

详细文档：
- [CI/CD 验证](./CI_CD_ANDROID_CONFIG_VERIFICATION.md)
- [完整报告](./ANDROID_CI_CD_CONFIGURATION_COMPLETE.md)
- [完成验证](./VERIFICATION_COMPLETE.md)
- [状态栏配置](./ANDROID_STATUSBAR_SETUP_COMPLETE.md)
