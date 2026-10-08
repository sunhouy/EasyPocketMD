# EasyPocketMD 鸿蒙应用

包名固定为 `com.yhsun.md`。这是 HarmonyOS NEXT / HarmonyOS 5+ 的 ArkTS Stage 工程，使用 ArkWeb 加载 `https://md.yhsun.cn/`，复用线上编辑器、账号和云端数据库。应用需要网络，网页资源更新随网站部署生效；此版本没有内置离线编辑器，也尚未移植 Tauri 原生文件打开、文件保存和导出桥接，不能认为与安卓应用功能完全一致。Web 组件启用 JavaScript、DOM storage 和数据库存储。返回键优先交给 WebView 历史，网页现有返回逻辑处理窗口及文件列表。

## 手动构建

合并后在 Actions 选择 **Build and Publish HarmonyOS App → Run workflow**。可填 `version`（例如 `2.9.10`）、`version_code`；版本名留空取 `package.json`，版本代码留空按 `major*1000000+minor*1000+patch` 生成。更新已上架应用时，必须保证版本代码大于此前版本。该流程只修改当前构建的鸿蒙清单，不改其他客户端版本。

构建成功后，下载 `easypocketmd-版本-harmony` 产物，包含签名校验通过的 `.hap` 以及包含该 HAP 的 `.app`。只有勾选 `publish_release` 才上传到 GitHub 的 `v版本` Release，不覆盖已有同名附件。流程不会自动提交 AppGallery Connect 审核，也不会触发服务器部署。

## GitHub 配置

在仓库 Settings → Secrets and variables → Actions 添加：

| 名称 | 类型 | 内容 |
| --- | --- | --- |
| `HARMONY_KEY` | Secret（已有） | `.p12` 文件完整内容的 Base64；不是文件路径 |
| `HARMONY_CERT` | Secret | 与 P12 匹配的发布证书 `.cer`（完整证书链）的 Base64 |
| `HARMONY_PROFILE` | Secret | `com.yhsun.md` 的发布 Profile `.p7b` 的 Base64；不要使用调试 Profile |
| `HARMONY_STORE_PASSWORD` | Secret | P12 密钥库密码，原始密码，不是 DevEco 配置里的加密串 |
| `HARMONY_KEY_PASSWORD` | Secret | 私钥密码，可能与密钥库密码相同 |
| `HARMONY_KEY_ALIAS` | Secret | P12 中的密钥别名 |
| `HARMONY_TOOLS_URL` | Secret | 华为官方 macOS ARM64 Command Line Tools 完整 ZIP 的可直接下载 HTTPS 地址 |
| `HARMONY_TOOLS_SHA256` | Variable | 与下载包匹配的 64 位 SHA256 |

工具包需要包含匹配的 Node、JBR、OHPM、Hvigor，以及 `sdk/default` 下完整 HarmonyOS SDK（含 ArkTS、签名工具和打包工具），支持工程 API 12 / modelVersion 5.0.0。工作流固定使用 GitHub `macos-15` ARM64 runner，因此不能提供 Windows、Linux 或 macOS Intel 工具包。下载链接不能返回登录网页；如果链接过期，需更新 URL。流程会先校验 SHA256，再安装工具。不需要自建 runner，也不需要在仓库存放签名文件。

华为官方工具下载入口：<https://developer.huawei.com/consumer/cn/download/command-line-tools-for-hmos>。开发者登录获取匹配的 macOS ARM64 版本及完整 SDK；如果下载页分开提供 SDK，需提供包含两者的完整工具包。证书和发布 Profile 在 AppGallery Connect 的“证书、APP ID 和 Profile”中申请；其中 APP ID 包名必须是 `com.yhsun.md`，Profile 必须为发布类型。上架前还需按 AppGallery Connect 的要求完成应用资料、隐私政策及审核提交。

Base64 转换（不会打印密码）：

```sh
# macOS / Linux
base64 < release.p12 | tr -d '\n' > release.p12.base64
base64 < release.cer | tr -d '\n' > release.cer.base64
base64 < release.p7b | tr -d '\n' > release.p7b.base64

# 查看别名，交互输入密码
keytool -list -keystore release.p12 -storetype PKCS12
```

将生成的 Base64 文件内容分别复制到对应 Secret。签名文件仅在 runner 临时目录解码，权限限制为当前用户，始终执行清理；仅上传最终 HAP/APP，不上传密钥、密码、证书、Profile 或签名日志。

## 本地构建

使用匹配的 DevEco Studio 工具链打开 `harmony/`。发布产品配置没有内置签名材料；命令行先用 Hvigor 构建未签名 HAP，再运行 `scripts/harmony-build.py pack`，使用官方 `hap-sign-tool.jar` 签名并校验，用 `app_packing_tool.jar` 打包 APP。不要把本地签名配置提交到 Git。

参考：

- 华为命令行流水线：<https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-command-line-building-app>
- 华为签名说明：<https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-signing>
