# EasyPocketMD
![EasyPocketMD](assets/readme/logo.png)

**AI 驱动 · 极速 · 跨平台**

<p align="center"><a href="README.md">English</a> &nbsp;|&nbsp; <a href="https://md.yhsun.cn/">DEMO</a></p>

一款几乎零学习成本的 Markdown 编辑器：无需记忆语法，也能轻松插入格式化文本、LaTeX 公式和图表。配合智能搜索与 AI 助手，常用功能都能几步完成。

实时协作、AI 辅助写作与流畅编辑体验，全部整合在美观的 Material Design 界面中。

如果这个项目对你有帮助，欢迎点一个 ⭐ Star，这是对我非常重要的支持。

[![Build and Deploy](https://github.com/sunhouy/EasyPocketMD/actions/workflows/deploy.yml/badge.svg)](https://github.com/sunhouy/EasyPocketMD/actions/workflows/deploy.yml)
[![Build Android APK](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-android.yml/badge.svg)](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-android.yml)
[![Build Electron App](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-electron.yml/badge.svg)](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-electron.yml)

[![Python 3.6+](https://img.shields.io/badge/python-3.6+-blue.svg)](https://www.python.org/downloads/)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

## 📖 目录
- [功能特性](#-功能特性)
- [快速开始](#-快速开始)
- [对比说明](#-对比说明)
- [项目架构](#-项目架构)
- [部署](#-部署)
- [演示](#-演示)
- [许可证](#-许可证)

## ✨ 功能特性

### 🤖 AI 集成

- AI 写作助手：支持写作、改写、自动排版，甚至可根据文档生成 PPT。
![AI Writing Assistant](assets/readme/aigenppt.gif)
- 智能图表与公式：通过 AI 提示词生成 LaTeX 公式和图表，无需手写代码。
![AI Charts & Formulas](assets/readme/aigenformula.gif)

### 👥 协作与沟通

- 实时协作：共享文档并流畅协同编辑。
![Real-time Collaboration](assets/readme/share.gif)
- 加密视频通话：内置双人端到端加密视频通话，支持 IPv6 双栈网络。
![Encrypted Video Call](assets/readme/videocall.gif)

### ✍️ 编辑体验
- 三种预览模式：所见即所得、即时渲染、分屏预览。
- 高效编辑：快速插入 Markdown、LaTeX 公式和图表；支持全文检索与文件差异对比。
![Editing Experience](assets/readme/insert.gif)
- 版本控制：浏览历史记录并比较不同版本差异。
![Version Control](assets/readme/history.gif)


### 🔗 兼容性与设计
- 跨平台：在多种设备上保持一致且流畅的使用体验。
![Cross Platform](assets/readme/1_1.png)
- 文件导入 / 导出：支持导入本地文档，导出为 TXT、DOC、PDF 等格式。
- 云打印：通过云打印客户端实现远程打印。
![Cloud Print](assets/readme/cloudprint.gif)
- 支持 Windows、Linux、Android 与 Web，并在各平台保持一致行为。
- 现代化界面：简洁的 Material Design，支持日间/夜间模式。

## 🚀 快速开始
### 环境要求
- Node.js ≥ 18.0
- Python ≥ 3.6
- MySQL ≥ 5.7
- Redis ≥ 6.0
- npm ≥ 9.0

### 安装

1. 克隆仓库
```bash
git clone https://github.com/sunhouy/EasyPocketMD.git
cd md
```

2. 安装 Node.js 依赖
```bash
npm install
```

3. 复制示例配置文件并按需修改：
```
cp .env.example .env
```

4. 初始化数据库
创建 MySQL 数据库和数据表（结构见 db.sql），并确保 Redis 已运行。

5. 构建前端
```bash
npm run build
```

6. 启动应用
```bash
npm start
```
生产环境（使用 PM2）：
```bash
npm install -g pm2
pm2 start api/server.js --name "easypocketmd"
```


## 📊 对比说明

| 功能                         | **本项目** | Typora | Obsidian | Notion | VS Code | Joplin                 |
|-----------------------------|-----------|--------|----------|--------|---------|------------------------|
| **数据隐私**                 | 🔒 本地 + 云端 | 本地 | 本地 | 仅云端 | 本地 | 本地 + 可选云同步 |
| **AI 写作助手**              | ✅ 原生支持 | ❌ | ❌（插件） | ❌ | ❌（插件） | ❌                      |
| **AI 图表与公式**            | ✅ 原生支持 | ❌ | ❌ | ❌ | ❌ | ❌                      |
| **AI 生成 PPT**             | ✅ 原生支持 | ❌ | ❌ | ❌ | ❌ | ❌                      |
| **移动端体验**               | 📱 一流体验 | 基础 | 基础 | 良好 | 无 | 基础                  |
| **实时协作**                 | ✅ E2EE 加密 | ❌ | ❌ | ✅ | ✅（Live Share） | ❌                      |
| **加密视频通话**             | ✅ 内置 | ❌ | ❌ | ❌ | ❌ | ❌                      |
| **云打印**                   | ✅ 原生支持 | ❌ | ❌ | ❌ | ❌ | ❌                      |
| **价格**                     | 免费 / 开源 | 一次性 $15 | 免费 / $50/年同步 | 免费版 | 免费 | 免费                   |


## 🏗️ 项目架构

项目采用 JavaScript + Python 架构。后端由 Node.js 实现，云打印服务端与客户端由 Python 实现。前端基于原生 JavaScript 开发，以保证优秀性能。
```
api/     后端 API 接口
assets/  Capacitor 应用资源
css/     前端 CSS 样式
js/      前端 JavaScript 脚本
print/   云打印服务端与客户端代码
scripts/ 部署脚本
tests/   测试脚本
```

## 🎬 演示

<https://md.yhsun.cn/>

## 📧 联系方式
`18763177732@139.com`

## 📄 许可证
本项目基于 MIT License 开源。

## 🙌 致谢
基于现代 Web 技术与开源工具构建，向所有贡献者致敬。

非常感谢所有让 EasyPocketMD 成为可能的开源项目及其贡献者。

完整依赖与许可证清单请见 [DEPENDENCIES.md](./DEPENDENCIES.md)。