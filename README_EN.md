# EasyPocketMD

![EasyPocketMD](assets/readme/logo.png)

**🤖 AI powered · ⚡ Blazing fast · 📱 Cross Platform · ✨ Zero Learning Curve**

<p align="center"><a href="README.md">中文</a> &nbsp;|&nbsp; <a href="https://md.yhsun.cn/">Demo</a> &nbsp;|&nbsp; <a href="CODE_WIKI.md">📖 Code Wiki</a></p>

## 🚀 Make Markdown Writing Easier Than Ever!

EasyPocketMD is an intelligent Markdown editor with almost zero learning curve. Forget about syntax memorization—insert formatted text, LaTeX formulas, and beautiful diagrams with just a `/` slash command! With full-text search and powerful AI assistance, complex tasks are just a few clicks away!

From personal writing, real-time collaboration, to multi-format publishing, EasyPocketMD compresses tedious workflows into a seamless creative experience. Think of it as your smarter Markdown workstation:

- ✨ **`/` Slash commands** for instant access to any operation, goodbye to menu hunting and mouse switching
- 🔍 **Smart file search** supports both title and full-text search for knowledge retrieval in milliseconds
- 🖥️ **Lightweight desktop client** built with Tauri, just tens of MB in size and launches in seconds
- 🧠 **Built-in knowledge graph** powered by WebAssembly high-performance computing to connect scattered notes into visual networks
- 📁 **Perfect compatibility** for local files, continuing your existing file organization

Real-time collaboration, AI-assisted writing, and a smooth editing experience—all wrapped in a beautiful Material Design interface. Supports Windows, Linux, macOS, Android, and the web—full platform coverage.

---

### ⭐ Support This Project

If you find EasyPocketMD useful, please give us a Star ⭐—it means a lot to me!

[![Build and Deploy](https://github.com/sunhouy/EasyPocketMD/actions/workflows/deploy.yml/badge.svg)
[![Build Android App](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-android.yml/badge.svg)
[![Build Tauri App](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-tauri.yml/badge.svg)
[![codecov](https://codecov.io/gh/sunhouy/EasyPocketMD/graph/badge.svg?token=8E02GDKIKQ)](https://codecov.io/gh/sunhouy/EasyPocketMD)
![NPM Downloads](https://img.shields.io/npm/dw/easypocketmd)
[![GitHub stars](https://img.shields.io/github/stars/sunhouy/EasyPocketMD?style=social)](https://github.com/sunhouy/EasyPocketMD)

---

## 📖 Table of Contents

- [✨ Features](#-features)
- [🚀 Quick Start](#-quick-start)
- [📊 Comparison](#-how-we-compare)
- [🏗️ Architecture](#-project-architecture)
- [💻 Development Guide](#-development-guide)
- [🎬 Demo](#-demo)
- [📧 Contact](#-contact)

---

## ✨ Features

### 🤖 AI Integration - Make Writing Smarter

- **AI Writing Assistant**: Help write, rewrite, auto-format, and even generate beautiful PPT slides from your document!
![AI Writing Assistant](assets/readme/aigenppt.gif)
- **Smart Charts & Formulas**: Generate LaTeX formulas and diagrams with AI prompts, no manual coding required!
![AI Charts & Formulas](assets/readme/aigenformula.gif)
- **AI PPT Generation**: Automatically analyze structure and generate professional presentations from document content

### 👥 Collaboration & Communication

- **Real-time Collaboration**: Share document links and invite multiple collaborators to work together seamlessly
![Real-time Collaboration](assets/readme/share.gif)
- **End-to-end Encrypted Video Call**: Built-in two-person video call with dual-stack IPv6 support
![Encrypted Video Call](assets/readme/videocall.gif)
- **Online Presence**: Real-time collaborator status display for efficient communication

### ✍️ Editing Experience

- **Three Preview Modes**: WYSIWYG, Instant Render, Split Preview
- **Efficient Quick Editing**: Quick insertion of Markdown, LaTeX formulas, and charts; full-text search and file diff support
![Editing Experience](assets/readme/insert.gif)
- **Complete Version Control**: Browse history and compare differences between versions, supports batch history management
![Version Control](assets/readme/history.gif)
- **Auto-save & Conflict Resolution**: Local auto-save support and intelligent conflict resolution for multi-device sync

### 🔗 Compatibility & Design

- **Cross-platform Seamless Experience**: Web, Windows, Linux, macOS, Android — five-platform coverage
![Cross Platform](assets/readme/1_1.png)
- **Powerful Import/Export**: Import local Markdown, DOCX, etc., export to TXT, DOC, PDF, PPT formats
- **Cloud Printing**: Remote printing via cloud print client
![Cloud Print](assets/readme/cloudprint.gif)
- **Modern UI**: Clean Material Design with perfect day/night mode support, elegant and beautiful

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18.0
- **Python** ≥ 3.6 (Cloud printing service
- **MySQL** ≥ 5.7 (Data persistence
- **Redis** ≥ 6.0 (Caching & collaboration
- **npm** ≥ 9.0

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/sunhouy/EasyPocketMD.git
cd easypocketmd
```
Or install via npm:
```bash
npm i easypocketmd
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit the .env file to configure database, Redis, ports, etc.
```

4. **Initialize databases**
Create MySQL database and tables (schema in [db.sql](file:///workspace/db.sql)), and ensure Redis is running.

5. **Build frontend**
```bash
npm run build
```

6. **Start the application**
```bash
npm start
```

For production, PM2 is recommended:
```bash
npm install -g pm2
pm2 start api/server.ts --name "easypocketmd"
```

### 📱 Tauri Desktop App Development & Building

Once Tauri dependencies are installed, you can develop and build apps for all platforms:

**Desktop Development:**
```bash
# Windows/macOS/Linux
npm run tauri:dev

# Build desktop apps
npm run build:tauri:win   # Windows
npm run build:tauri:linux  # Linux
npm run build:tauri:mac    # macOS
```

**Android Development & Building:**
```bash
# Initialize Android project
npm run tauri:android:init

# Android development mode
npm run tauri:android:dev

# Build Android APK
npm run tauri:android:build
```

### 🎯 Dev Mode Quick Start

If you just want to quickly experience the frontend:
```bash
npm run dev
```

---

## 📊 How We Compare

| Feature                     | **EasyPocketMD** | Typora | Obsidian | Notion | VS Code | Joplin                 |
|----------------------------|-----------------|--------|----------|--------|---------|------------------------|
| **Data Privacy**           | 🔒 Local + Cloud | Local | Local | Cloud-only | Local | Local + Cloud optional |
| **AI Writing Assistant**   | ✅ Native | ❌ | ❌ (plugin) | ❌ | ❌ (plugin) | ❌                  |
| **AI Charts & Formulas** | ✅ Native | ❌ | ❌ | ❌ | ❌ | ❌                     |
| **AI PPT Generation** | ✅ Native | ❌ | ❌ | ❌ | ❌ | ❌                     |
| **Mobile Experience** | 📱 First-class | Basic | Basic | Good | None    | Basic                  |
| **Real-time Collaboration** | ✅ E2EE | ❌ | ❌ | ✅ | ✅ (Live Share) | ❌             |
| **Encrypted Video Call** | ✅ Built-in | ❌ | ❌ | ❌ | ❌ | ❌                     |
| **Cloud Printing** | ✅ Native | ❌ | ❌ | ❌ | ❌ | ❌                     |
| **Knowledge Graph** | ✅ WebAssembly | ❌ | ❌ | ❌ | ❌ | ❌                     |
| **Price** | 🆓 Free / MIT | One-time $15 | Free / $50/year | Free tier | Free | Free                   |

---

## 🏗️ Project Architecture

The project uses a **modern TypeScript + Python architecture:

- **Frontend**: TypeScript + Vite + Vditor + WebAssembly (C/C++)
- **Backend**: Node.js + Express + MySQL + Redis
- **Real-time Collaboration**: WebSocket
- **Cross Platform**: Tauri (Desktop/Android)
- **Cloud Printing**: Python

```
api/                    # Backend API services
├── config/             # Database/cache configuration
├── middleware/       # Middleware (rate limiting, auth, etc.)
├── models/           # Core business models
├── realtime/        # WebSocket real-time collaboration
├── routes/           # API routes
└── utils/            # Utility functions

js/                     # Frontend source
├── files/            # File management
├── ui/               # UI components
└── page/             # Page logic

wasm_text_engine/      # WebAssembly high-performance modules

src-tauri/          # Tauri cross-platform apps

tests/                  # Tests
```

For detailed architecture and development docs see [CODE_WIKI.md](file:///workspace/CODE_WIKI.md)

---

## 💻 Development Guide

### Core Tech Stack

- **Frontend Builder**: Vite
- **Markdown Editor**: Vditor
- **Charting Library**: ECharts
- **WebAssembly**: High-performance computing in C/C++
- **Backend Framework**: Express.js
- **Databases**: MySQL (persistence) + Redis (caching)
- **Real-time Communication**: WebSocket (ws)
- **Cross Platform**: Tauri
- **Testing**: Jest + Supertest

### Useful Commands

```bash
# Frontend development
npm run dev

# Build frontend
npm run build:web

# Full build (including WASM
npm run build

# Run backend service
npm start

# Run tests
npm test

# WASM text engine build
npm run wasm:text:build

# WASM image compression build
npm run wasm:image:build
```

---

## 🎬 Demo

Try it online now: <https://md.yhsun.cn/>

---

## Contact
`sunhouyun@emails.bjut.edu.cn`

This project is licensed under the MIT License.

---

## 🙌 Acknowledgements

Built with modern web technologies and open source tools. Salute to all contributors!

For full dependency and license list see [DEPENDENCIES.md](file:///workspace/DEPENDENCIES.md)

---

> 💡 **Pro Tip: If you like this project, don't forget to Star ⭐!
