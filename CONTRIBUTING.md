# 为 EasyPocketMD 做贡献


感谢你对 **EasyPocketMD** 的关注！🎉 本项目是新一代 AI 驱动的跨平台 Markdown 编辑器，基于 JavaScript + Python 混合架构，支持桌面（Tauri）、Android 及 Web 全平台。

本文件为项目贡献指南，旨在帮助你顺利参与开发。请花几分钟阅读，以便我们高效协作。

## 行为准则

本项目参与者须遵守[贡献者公约](CODE_OF_CONDUCT.md)。请友善交流，共建包容社区。

## 如何参与贡献

### 🐛 报告 Bug

提交 Bug 前，请先搜索[议题列表](https://github.com/sunhouy/EasyPocketMD/issues)，确认是否已有类似报告。若没有，请新建议题，包含以下信息：

- **清晰的标题**
- **复现步骤**
- **预期与实际行为的对比**
- **环境信息**：操作系统、Node.js 版本、数据库版本、Tauri 版本等
- **截图或日志**（如适用）

### 💡 功能建议

欢迎提出新功能想法。请在议题中说明：

- 该功能解决什么问题
- 建议的实现方式
- 对现有用户的价值

### 🔧 提交代码 (Pull Request)

1. **Fork** 本仓库，并从 `main` 分支创建你的特性分支。
2. **搭建开发环境**（见下方说明），确保现有测试全部通过。
3. 编写清晰、符合项目风格的代码。
4. **为新功能编写测试**（测试目录位于 `tests/`）。
5. 运行 `npm test` 确保全部测试通过。
6. 遵循下方的**提交信息规范**提交你的改动。
7. 推送分支并发起 Pull Request，在描述中关联相关议题（如 `Closes #42`）。

## 开发环境配置

### 环境要求

| 依赖 | 最低版本 | 用途 |
|------|----------|------|
| Node.js | ≥ 18.0 | 前后端运行环境 |
| Python | ≥ 3.6 | 云打印服务 |
| MySQL | ≥ 5.7 | 数据持久化 |
| Redis | ≥ 6.0 | 缓存与实时协作 |
| npm | ≥ 9.0 | 包管理 |
| Rust / Tauri CLI | 最新稳定版 | 桌面与移动端构建 |

### 快速开始

```bash
# 克隆你的 fork
git clone https://github.com/你的用户名/EasyPocketMD.git
cd EasyPocketMD

# 安装 Node.js 依赖
npm install

# 配置环境变量
cp .env.example .env
# 按需编辑 .env（数据库、Redis、端口等）

# 初始化数据库（结构见 db.sql），并启动 Redis

# 启动前端开发模式（纯 Web 体验）
npm run dev

# 完整构建（含 WASM 模块）
npm run build

# 启动后端服务
npm start

# 运行测试
npm test
```

### Tauri 桌面 / Android 开发

```bash
# 桌面开发模式
npm run tauri:dev

# 构建 Windows / Linux / macOS 应用
npm run build:tauri:win
npm run build:tauri:linux
npm run build:tauri:mac

# Android 初始化
npm run tauri:android:init

# Android 开发模式
npm run tauri:android:dev

# 构建 Android APK
npm run tauri:android:build
```

## 项目结构

```
EasyPocketMD/
├── api/                  # 后端 API (Express)
│   ├── config/           # 数据库/缓存配置
│   ├── middleware/       # 中间件 (限流、认证等)
│   ├── models/           # 核心业务模型
│   ├── realtime/         # WebSocket 实时协作
│   ├── routes/           # API 路由
│   └── utils/            # 工具函数
├── js/                   # 前端源码 (原生 JavaScript)
│   ├── files/            # 文件管理
│   ├── ui/               # UI 组件
│   └── page/             # 页面逻辑
├── css/                  # 前端样式
├── assets/               # 静态资源
├── print/                # 云打印服务端/客户端 (Python)
├── wasm_text_engine/     # WebAssembly 高性能文本引擎 (C/C++)
├── scripts/              # 部署脚本
├── tests/                # 测试代码 (Jest + Supertest)
├── src-tauri/            # Tauri 跨平台应用
└── .github/              # GitHub Actions 工作流与模板
```

## 核心技术栈

| 层面 | 技术 |
|------|------|
| 前端构建 | Vite |
| Markdown 编辑 | Vditor |
| 图表 | ECharts |
| 高性能计算 | WebAssembly (C/C++) |
| 后端框架 | Express.js |
| 数据库与缓存 | MySQL + Redis |
| 实时通讯 | WebSocket (ws) |
| 跨平台桌面/移动 | Tauri |
| 测试 | Jest + Supertest |

## 代码风格

- **JavaScript**：遵循项目既有的 ESLint 配置。前端采用原生 JavaScript，避免引入不必要的框架抽象。
- **Python**：云打印模块请遵循 PEP 8，使用 Black 格式化。
- **CSS**：保持与现有 Material Design 风格一致。

## 提交信息规范

本项目采用[约定式提交](https://www.conventionalcommits.org/zh-hans/)。格式如下：

```
<类型>(<范围>): <简短描述>
```

**类型**包括：

- `feat` — 新功能
- `fix` — Bug 修复
- `docs` — 文档变更
- `style` — 格式调整（不影响代码逻辑）
- `refactor` — 重构
- `test` — 测试增改
- `chore` — 构建、依赖等杂项

**示例**：

- `feat(collab): 添加端到端加密视频通话`
- `fix(export): 修复 PDF 导出时公式渲染错位`
- `chore(ci): 更新 GitHub Actions 构建脚本`

标记重大变更时，在类型/范围后加 `!`，如 `refactor(api)!: 重构实时协作协议`。

## 测试

所有贡献需确保现有测试通过，并鼓励为新功能补充测试。

- **单元测试**：`tests/` 目录，使用 Jest
- **API 测试**：使用 Supertest
- **WASM 模块**：单独构建和测试

```bash
npm test                  # 运行全部测试
npm run wasm:text:build   # 构建 WASM 文本引擎
npm run wasm:image:build  # 构建 WASM 图片压缩模块
```

CI 会在每次 PR 时自动运行测试，未通过的 PR 不会被合并。

## 文档

如果改动影响用户使用方式或开发流程，请同步更新 `README.md` 或相关文档。

## 版本与发布

维护者负责版本发布。项目使用语义化版本，并通过约定式提交自动生成更新日志。你的 PR 合并后，将在下一发布周期中随版本释出。

## 资源链接

- 📦 **npm 包**：[easypocketmd](https://www.npmjs.com/package/easypocketmd)
- 🚀 **在线演示**：[https://md.yhsun.cn/](https://md.yhsun.cn/)
- 📖 **主仓库**：[https://github.com/sunhouy/EasyPocketMD](https://github.com/sunhouy/EasyPocketMD)

## 有疑问？

- 发起 [GitHub 议题](https://github.com/sunhouy/EasyPocketMD/issues)
- 联系维护者：sunhouyun@emails.bjut.edu.cn

---

感谢你为 EasyPocketMD 贡献代码与智慧！💙

---

