<p align="center"><img src="assets/readme/logo.png" alt="EasyPocketMD" width="160"></p>

# EasyPocketMD

**从一段灵感，到一份可以分享的文档。**

写笔记、整理报告、插入公式和图表，或者把分析代码与结果放在同一份 Markdown 中：EasyPocketMD 将这些工作放进一个编辑器。你可以直接编辑排版后的内容，也可以随时切回源码；在浏览器中开始，在桌面或 Android 应用中继续。

[在线体验](https://md.yhsun.cn/) · [English](README_EN.md) · [版本发布](https://github.com/sunhouy/EasyPocketMD/releases) · [反馈问题](https://github.com/sunhouy/EasyPocketMD/issues)

![CI](https://github.com/sunhouy/EasyPocketMD/actions/workflows/deploy.yml/badge.svg)
![License](https://img.shields.io/github/license/sunhouy/EasyPocketMD)

## 写作、分析、协作，连成一条工作流

- **让 Markdown 更容易写。** Vditor 提供所见即所得、即时渲染和分屏预览。插入菜单支持公式、表格、Mermaid 和 ECharts；代码块带行号和语法高亮，可直接编辑、切换语言、折叠和删除。
- **把代码结果留在文档里。** Python 在服务器 Docker 沙箱中运行，支持交互输入、中文 Matplotlib 图表和常用数据分析库。代码块工具栏可上传文件、打开文件管理和命令行；结果可复制，生成的图片或文件可下载、插入文档。运行窗口支持拖动、缩放、最大化和最小化。
- **离线也能继续写。** 文件支持本地保存与云端同步，列表显示同步状态及本地文件标记。发生无法自动合并的修改时，用双栏差异视图处理冲突；历史版本可用于比较和恢复。本机文件的访问能力取决于浏览器或应用权限。
- **分享时保留控制权。** 分享文档可设置仅查看或允许编辑，协作支持编辑者光标及编辑记录。需要保护私密内容时，可启用端到端加密，并管理账号密码、专用密码或通行密钥等解锁方式。
- **让 AI 帮你整理，而不是替你决定。** 配置自己的兼容模型接口，辅助写作、公式和图表生成。文档可导出 PPT：复制生成提示给文本大模型，将完整 JSON 结果粘贴回来，选择内置开源模板后直接生成并下载演示文稿。
- **按你的习惯阅读。** 支持日间/夜间模式、编辑器背景和主题色、大纲、字数与 Token 统计，以及可拖动、缩放的查找替换窗口。界面支持中文和英文。

### 从编辑器带走你的成果

导入 Markdown、文本或 Word 文档；导出 Markdown、文本、HTML、PDF、Word、PPT 和 XLSX。XLSX 将 Markdown 表格分为独立工作表并保留全文；PPT 提供 7 套 MIT 授权模板改编版式，无需联网下载模板。HTML、PDF、Word 默认标题左对齐，支持中英文字体分别设置，英文默认 Times New Roman；字体缺失时使用兼容字体。PDF/Word 导出由服务端转换工具支持；公式、图表及字体的具体效果取决于格式和转换引擎，建议导出后检查排版。AI、云同步、协作、Python 和部分导出功能需要相应服务或配置。

## AI 查询全部文档

在 AI 助手中选择 **AI查询**，可以从所有文件夹的云端文档、本地文档和未保存的编辑内容中查找信息，汇总跨文档答案并查看来源编号及原文摘录。无需逐个打开文档。查询每次建立内存中的文档关联索引，分批读取全部可用正文；Markdown 和双链文档链接参与关联。资料较多时分层汇总，不限于当前文件或前几个关键词命中的文件。

沿用“设置 → AI 模型”中填写的 API 地址、密钥和模型，查询正文发送到用户配置的 AI 服务。加密文档默认不参与；勾选后需解锁，解密正文同样发送给该服务。隐藏配置文件不会参与查询，解密正文和查询索引不持久化。界面显示读取进度、未能读取的文件和取消按钮。文档越多，所需时间和 API 用量越高；未找到依据时会提示资料不足。

## Docker 部署：构建在 CI，运行在服务器

生产部署使用 Docker。GitHub Actions 构建前端及 app、print、gateway、Python 沙箱镜像，再通过 SSH/rsync 将镜像内容传到服务器。**服务器无需访问 Docker Hub/GHCR 下载基础镜像，也无需现场安装 npm/pip 依赖**，适合外网下载不稳定的环境。

镜像按内容摘要拆分、压缩和缓存，后续发布只传输新增或变化的对象；依赖层未改变时可以复用。首次部署仍需完整传输，删除服务器对象缓存会增加下次传输量。

部署流程包含摘要校验、空间和内存检查、健康检查、发布切换及回滚。小内存机器导入/切换时可能短暂停止本项目服务以释放资源；不要将其理解为保证无停机。MySQL、Redis 和宿主 TLS 入口复用已有服务，用户文件持久化在镜像之外。

### 部署前准备

1. 准备 Linux amd64 服务器、Docker Engine、Python、rsync，以及 MySQL、Redis 和 Nginx TLS 入口。沙箱总资源控制需要 systemd、cgroup v2 和 Docker 的 systemd cgroup 驱动。
2. 按 [环境变量清单](.env.example) 配置数据库、Redis、JWT、站点地址和管理员账号；将 SSH 连接及 TLS 配置放入 GitHub Actions secrets。可选 `SSL_EMAIL` 用于证书续签通知。
3. 在 Actions 中运行 **CI/CD** 工作流，选择 `deploy`；需要回退时选择 `rollback`。每次部署将镜像与公开校验信息保存为 GitHub Actions 的 `docker-release-main` / `docker-release-dev` artifact（保留 90 天，不含运行密钥）。回滚由 CI 下载上一份成功发布的 artifact，并使用当前 Secrets 重新生成运行配置；artifact 过期或旧发布没有 artifact 时，需要重新部署目标 Git 提交。服务器在镜像传输及导入前清理过期资源，成功切换后仅保留各频道当前版本的容器、镜像、发布文件与共享层缓存，上一版本只保留 GitHub 引用。
4. 服务器仅保留当前发布所需资源，定期备份数据库与用户文件。TLS 自动续签仍要求域名解析及 HTTP 验证入口可达。

完整服务器约定、secret 名称、增量传输、资源预算和证书说明见 [部署指南](deploy/README.md)。该流程按仓库现有服务器布局设计；首次部署到其他环境时，需要调整路径和 Nginx 入口。

### Python 沙箱

Python 3.12 环境预装数据处理、科学计算、机器学习、图像处理及办公文档库，完整清单见 [requirements.txt](sandbox/python/requirements.txt)。支持最多 5 个并发任务，并通过共享资源预算限制总占用。执行容器不联网，也不挂载业务数据或 Docker socket；可信 API 服务负责调度。

上传文件和代码共享临时 `/tmp/home` 目录。会话空闲 30 分钟后会清理，刷新页面或重启服务可能丢失文件，重要结果请及时下载。增加 Python 包需要修改依赖清单、重新构建并发布沙箱镜像。详情见 [沙箱说明](sandbox/python/README.md)。

## 本地开发

使用 **Node.js 24**（与 CI 一致）。后端完整功能还需要 MySQL、Redis；原生应用需要 Rust/Tauri 对应平台工具链，完整 WASM 构建需要 Emscripten。

```bash
git clone https://github.com/sunhouy/EasyPocketMD.git
cd EasyPocketMD
npm ci
npm run dev
```

`npm run dev` 启动前端开发服务。后端配置位于 `api/config/`，环境变量参考 `.env.example`，数据库结构见 [db.sql](db.sql)；配置完成后另开终端执行 `npm start`。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 前端开发 |
| `npm start` | API 服务 |
| `npm run build:web` | Web 构建（使用已有 WASM 产物） |
| `npm run build` | 完整 Web/WASM 构建 |
| `npm test` | Jest 单元及集成测试 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run tauri:dev` | 桌面应用开发 |
| `npm run build:tauri:win` / `build:tauri:linux` / `build:tauri:mac` | 对应平台打包 |
| `npm run tauri:android:build` | Android APK 构建 |

## 代码导航

| 目录 | 内容 |
| --- | --- |
| `js/files/` | 文件、同步、历史版本及差异编辑 |
| `js/ui/` | 分享、导出、图表和 AI 界面 |
| `js/code-*.ts` | 代码块编辑器和运行工作台 |
| `js/translations.ts`、`js/i18n-messages.ts` | 中英文文案与统一翻译接口 |
| `api/`、`shared/` | Express API、协作和共享协议 |
| `sandbox/python/` | Python 执行协议、镜像和依赖 |
| `deploy/`、`scripts/` | Docker 构建、增量发布、资源控制及 SSL |
| `src-tauri/` | 桌面/Android 应用 |
| `wasm_text_engine/` | 文本和图片处理 WASM |
| `tests/` | 自动化回归测试 |

更多说明见 [CODE_WIKI.md](CODE_WIKI.md)，依赖与许可证见 [DEPENDENCIES.md](DEPENDENCIES.md)。

## 参与项目

欢迎提交问题、改进建议和 Pull Request。反馈时请附上平台、操作步骤及错误信息；涉及加密文档时，请使用可公开的最小示例。

EasyPocketMD 采用 [MIT 许可证](LICENSE)。感谢 Vditor、CodeMirror、Tauri 及其他开源项目，让写作工具可以持续改进。
