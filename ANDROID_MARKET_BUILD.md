# 应用市场安卓构建

在 GitHub Actions 中选择 **Build Android App for App Markets**，点击 **Run workflow**，选择需要构建的分支。成功后从运行页面的 Artifacts 下载 **md-tauri-android-market**，其中的 `easypocketmd-android-arm64-release.apk` 用于提交应用市场。此工作流仅手动触发，不创建或更新 GitHub Release。

包名仍为 `cn.yhsun.md`，签名沿用普通安卓构建的 `JKS_BASE64`、`JKS_ALIAS`、`JKS_PASSWORD` Secrets。上传产物前会校验 APK 的包名和签名证书。版本号取所选分支的 `package.json`，提交更新前需在分支中更新版本号。

工作流设置 `VITE_APP_MARKET=1`，使登录和注册必须主动勾选已阅读并同意 [隐私政策](https://yhsun.cn/privacy.html)。此版本隐藏 AI 助手、AI 查询、AI 生成与排版、各选择器中的 AI 搜索、依赖 AI 的 PPT 导出、AI 设置与快捷操作，以及 Live2D 看板娘；AI 请求和 AI 配置云同步也被禁用。普通安卓、桌面和网页构建不设置该标志，保持原有功能。
