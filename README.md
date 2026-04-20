# EasyPocketMD

![EasyPocketMD](assets/readme/logo.png)

**🤖 AI 驱动 · ⚡ 极速启动 · 📱 全平台 · ✨ 零学习成本**

<p align="center"><a href="README_EN.md">English</a> &nbsp;|&nbsp; <a href="https://md.yhsun.cn/">DEMO</a> </p>

## 🚀 让 Markdown 创作从未如此简单！

EasyPocketMD 是一款几乎零学习成本的智能 Markdown 编辑器，无需记忆语法，通过 `/` 斜杠命令即可轻松插入格式化文本、LaTeX 公式和精美图表。配合全文智能搜索与强大 AI 助手，让复杂任务几步完成！

从个人写作、多人实时协作，再到多格式发布，EasyPocketMD 将繁琐流程压缩成顺手的创作体验。你可以把它当作一个更聪明的 Markdown 工作台：

- ✨ **`/` 斜杠命令**直达任意操作，告别菜单查找和鼠标切换
- 🔍 **智能文件搜索**同时支持标题和全文检索，毫秒级定位知识
- 🖥️ **轻量级桌面端**基于 Tauri 构建，安装包仅十几 MB，秒级启动
- 🧠 **与其他格式文件无缝支持**，支持导入本地 Markdown、DOCX 等，导出为 TXT、DOC、PDF、PPT 等格式，完美支持公式和图表，支持自定义字体字号段落等导出样式
- 📁 **完美兼容本地文件**，延续你已有的文件组织方式

实时协作、AI 辅助写作与流畅编辑体验，全部整合在美观的 Material Design 界面中。支持 Windows、Linux、macOS、Android 与 Web，全平台覆盖。

---

### ⭐ 支持这个项目

如果 EasyPocketMD 对你有帮助，欢迎点一个 Star，这是对我最大的鼓励！

![Build and Deploy](https://github.com/sunhouy/EasyPocketMD/actions/workflows/deploy.yml/badge.svg)
![Build Android App](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-android.yml/badge.svg)
![Build Tauri App](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-tauri.yml/badge.svg)
![codecov](https://codecov.io/gh/sunhouy/EasyPocketMD/graph/badge.svg?token=8E02GDKIKQ)
![NPM Downloads](https://img.shields.io/npm/dw/easypocketmd)
![GitHub stars](https://img.shields.io/github/stars/sunhouy/EasyPocketMD?style=social)

---

## 📖 目录

- [✨ 功能特性](#-功能特性)
- [🚀 快速开始](#-快速开始)
- [📊 对比说明](#-对比说明)
- [🏗️ 项目架构](#-项目架构)
- [💻 开发指引](#-开发指引)
- [🎬 演示](#-演示)
- [📧 联系方式](#-联系方式)

---

## ✨ 功能特性

### 🤖 AI 集成 - 让创作更智能

- **AI 写作助手**：支持写作、改写、自动排版，甚至一键根据文档生成精美 PPT！
![AI Writing Assistant](assets/readme/aigenppt.gif)
- **智能图表与公式**：通过 AI 提示词生成 LaTeX 公式和图表，无需手写代码！
![AI Charts & Formulas](assets/readme/aigenformula.gif)
- **AI 快速生成 PPT**：基于文档内容自动分析结构，一键生成专业演示文稿

### 👥 协作与沟通

- **实时协作编辑**：共享文档链接，邀请多人流畅协同编辑
![Real-time Collaboration](assets/readme/share.gif)
- **端到端加密视频通话**：内置双人视频通话，支持 IPv6 双栈网络
![Encrypted Video Call](assets/readme/videocall.gif)
- **在线 Presence**：实时显示协作者状态，随时沟通高效协作

### ✍️ 编辑体验

- **三种预览模式**：所见即所得 (WYSIWYG)、即时渲染 (Instant Render)、分屏预览 (Split Preview)
- **高效快捷编辑**：快速插入 Markdown、LaTeX 公式和图表；支持全文检索与文件差异对比
![Editing Experience](assets/readme/insert.gif)
- **完整版本控制**：浏览历史记录并比较不同版本差异，支持批量管理历史
![Version Control](assets/readme/history.gif)
- **自动保存与冲突处理**：支持本地自动保存，智能处理多设备同步冲突

### 🔗 兼容性与设计

- **跨平台无缝体验**：Web、Windows、Linux、macOS、Android 五端覆盖
![Cross Platform](assets/readme/1_1.png)
- **强大文件导入/导出**：支持导入本地 Markdown、DOCX 等，导出为 TXT、DOC、PDF、PPT 等格式
- **云打印**：通过云打印客户端实现远程打印
![Cloud Print](assets/readme/cloudprint.gif)
- **现代化界面**：简洁的 Material Design，完美支持日间/夜间模式，美观优雅

---

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 18.0
- **Python** ≥ 3.6 (云打印服务)
- **MySQL** ≥ 5.7 (数据存储)
- **Redis** ≥ 6.0 (缓存与协作)
- **npm** ≥ 9.0

### 安装

1. **克隆仓库**
```bash
git clone https://github.com/sunhouy/EasyPocketMD.git
cd easypocketmd
```
或者从 npm 安装：
```bash
npm i easypocketmd
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境**
```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库、Redis、端口等
```

4. **初始化数据库**
创建 MySQL 数据库和数据表（结构见 [db.sql](file:///workspace/db.sql)，并确保 Redis 已启动。

5. **构建前端**
```bash
npm run build
```

6. **启动应用**
```bash
npm start
```

生产环境推荐使用 PM2：
```bash
npm install -g pm2
pm2 start api/server.ts --name "easypocketmd"
```

### 📱 Tauri 桌面应用开发与构建

安装好 Tauri 依赖后，可直接开发和构建各平台应用：

**桌面开发：**
```bash
# Windows/macOS/Linux
npm run tauri:dev

# 构建桌面应用
npm run build:tauri:win   # Windows
npm run build:tauri:linux  # Linux
npm run build:tauri:mac    # macOS
```

**Android 开发与构建：**
```bash
# 初始化 Android 项目
npm run tauri:android:init

# Android 开发模式
npm run tauri:android:dev

# 构建 Android APK
npm run tauri:android:build
```

### 🎯 开发模式快速启动

如果你只是想快速体验前端：
```bash
npm run dev
```

---

## 📊 对比说明

| 功能                         | **EasyPocketMD** | Typora | Obsidian | Notion | VS Code | Joplin                 |
|-----------------------------|-------------------|--------|----------|--------|---------|------------------------|
| **数据隐私**                 | 🔒 本地 + 云端 | 本地 | 本地 | 仅云端 | 本地 | 本地 + 可选云同步 |
| **AI 写作助手**              | ✅ 原生支持 | ❌ | ❌（插件） | ❌ | ❌（插件） | ❌                      |
| **AI 图表与公式**            | ✅ 原生支持 | ❌ | ❌ | ❌ | ❌ | ❌                      |
| **AI 一键生成 PPT**         | ✅ 原生支持 | ❌ | ❌ | ❌ | ❌ | ❌                      |
| **移动端体验**               | 📱 一流体验 | 基础 | 基础 | 良好 | 无 | 基础                  |
| **实时协作**                 | ✅ E2EE 加密 | ❌ | ❌ | ✅ | ✅（Live Share） | ❌                      |
| **加密视频通话**             | ✅ 内置 | ❌ | ❌ | ❌ | ❌ | ❌                      |
| **云打印**                   | ✅ 原生支持 | ❌ | ❌ | ❌ | ❌ | ❌                      |
| **知识图谱**                 | ✅ 内置 WebAssembly | ❌ | ❌ | ❌ | ❌ | ❌                      |
| **价格**                     | 完全免费 / MIT 开源 | 一次性 $15 | 免费 / $50/年同步 | 免费版 | 免费 | 免费                   |

---

## 🏗️ 项目架构

项目采用混合架构：

- 前端：JavaScript + Vite + WebAssembly (C/C++)
- 后端：Node.js + Express + MySQL + Redis
- 实时协作：WebSocket
- 跨平台：Tauri (桌面/Android)
- 云打印：Python

```
api/                    # 后端 API 服务
├── config/             # 数据库/缓存配置
├── middleware/       # 中间件 (限流、认证等)
├── models/           # 核心业务模型
├── realtime/        # WebSocket 实时协作
├── routes/           # API 路由
└── utils/            # 工具函数

js/                     # 前端源码
├── files/            # 文件管理
├── ui/               # UI 组件
└── page/             # 页面逻辑

wasm_text_engine/      # WebAssembly 高性能模块

src-tauri/          # Tauri 跨平台应用

tests/                  # 测试代码
```

详细架构与开发文档请查阅 [CODE_WIKI.md](file:///workspace/CODE_WIKI.md)

---

## 💻 开发指引

### 核心技术栈

- **前端构建**：Vite
- **Markdown 编辑器**：Vditor
- **图表库**：ECharts
- **WebAssembly**：C/C++ 高性能计算
- **后端框架**：Express.js
- **数据库**：MySQL (持久化 + Redis 缓存
- **实时通讯**：WebSocket (ws)
- **跨平台**：Tauri
- **测试**：Jest + Supertest

### 常用命令

```bash
# 前端开发
npm run dev

# 构建前端
npm run build:web

# 完整构建 (含 WASM)
npm run build

# 运行后端服务
npm start

# 运行测试
npm test

# WASM 文本引擎构建
npm run wasm:text:build

# WASM 图片压缩构建
npm run wasm:image:build
```

---

## 🎬 演示

立即在线体验：<https://md.yhsun.cn/>

---

## 📧 联系方式
`sunhouyun@emails.bjut.edu.cn`

## 📄 许可证

本项目基于 MIT License 开源。

---

## 🙌 致谢

基于现代 Web 技术与开源工具构建，向所有贡献者致敬！

完整依赖与许可证清单请见 [DEPENDENCIES.md](file:///workspace/DEPENDENCIES.md)

---

> 💡 如果你喜欢这个项目，别忘了 Star ⭐ 哦！
