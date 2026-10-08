# EasyPocketMD 鸿蒙应用

包名固定为 `com.yhsun.md`。这是 HarmonyOS NEXT / HarmonyOS 5+ 的 ArkTS Stage 工程，使用 ArkWeb 加载 `https://md.yhsun.cn/`，复用线上编辑器、账号和云端数据库。应用需要网络，网页资源更新随网站部署生效；此版本没有内置离线编辑器，也尚未移植 Tauri 原生文件打开、文件保存和导出桥接，不能认为与安卓应用功能完全一致。Web 组件启用 JavaScript、DOM storage 和数据库存储。返回键优先交给 WebView 历史，网页现有返回逻辑处理窗口及文件列表。

## 手动构建

合并后在 Actions 选择 **Build and Publish HarmonyOS App → Run workflow**。可填 `version`（例如 `2.9.10`）、`version_code`；版本名留空取 `package.json`，版本代码留空按 `major*1000000+minor*1000+patch` 生成。更新已上架应用时，必须保证版本代码大于此前版本。该流程只修改当前构建的鸿蒙清单，不改其他客户端版本。

构建成功后，下载 `easypocketmd-版本-harmony` 产物，包含签名校验通过的 `.hap` 以及保留完整 HAP 签名的 `.app`。APP 打包禁用 HAP 内 pack.info 的重写，打包完成后必须再对 APP 容器本身执行 sign-app 签名。随后校验最终 APP 签名、逐字节比对内嵌 HAP，并再次执行 HAP 签名/代码签名校验；任一步失败不会上传。仅验证 HAP 签名不能证明 APP 已签名。只有勾选 `publish_release` 才上传到 GitHub 的 `v版本` Release，不覆盖已有同名附件。流程不会自动提交 AppGallery Connect 审核，也不会触发服务器部署。

## 安装与发布区别

Actions 显示的产物大小是 ZIP 大小，不是手机应用占用空间。本工程只有 ArkWeb 容器和图标，编辑器通过网络加载，几十到几百 KB 的产物并不代表编译失败；它不是完整离线编辑器。

- 下载 Actions 产物后先解压，外层 ZIP 不能直接安装。
- `.app` 是提交 AppGallery Connect 的发布包，不是点击即安装的 APK。发布签名不能保证本地旁加载获准，实际分发须使用华为应用市场或 AGC 支持的测试渠道。
- 本地设备调试使用 `.hap` 和 `hdc install 文件.hap`，需要匹配的调试证书、包含设备 UDID 的调试 Profile 以及开发者模式。当前发布工作流只接受发布 Profile，不生成调试包，不能把发布包当成调试包。
- 仅支持 HarmonyOS NEXT / HarmonyOS 5+，不能作为 Android APK 安装在旧版 HarmonyOS 或 Android 上。

参考华为安装错误说明：<https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-v5/bm-tool-V5>。若安装仍失败，请提供具体错误码与系统版本，区分包损坏、签名来源限制及 SDK 不兼容。

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

工具包需要包含匹配的 Node、OHPM、Hvigor，Java 由 Actions 单独安装 JDK 17（命令行工具包不要求包含 JBR），以及 `sdk/default` 下完整 HarmonyOS SDK（含 ArkTS、签名工具和打包工具），支持工程 API 12 / modelVersion 5.0.0。工作流固定使用 GitHub `macos-15` ARM64 runner，因此不能提供 Windows、Linux 或 macOS Intel 工具包。下载链接不能返回登录网页；如果链接过期，需更新 URL。流程会先校验 SHA256，再安装工具。不需要自建 runner，也不需要在仓库存放签名文件。

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

使用匹配的 DevEco Studio 工具链打开 `harmony/`。发布产品配置没有内置签名材料；命令行先用 Hvigor 构建未签名 HAP，再运行 `scripts/harmony-build.py pack`，使用官方 `hap-sign-tool.jar` 签名并校验，用 `app_packing_tool.jar` 打包未签名 APP，再用 `hap-sign-tool.jar sign-app` 对 APP 签名，最后用 `verify-app` 校验最终 APP 和内部 HAP。这是 Hvigor 的 PackageApp → SignApp 两个独立步骤，不能直接上传打包工具生成的未签名 APP。不要把本地签名配置提交到 Git。

参考：

- 华为命令行流水线：<https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-command-line-building-app>
- 华为签名说明：<https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-signing>
