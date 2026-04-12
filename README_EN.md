# EasyPocketMD
![EasyPocketMD](assets/readme/logo.png)

**AI powered · Superfast · Cross Platform**

<p align="center"><a href="README.md">中文入口</a> &nbsp;|&nbsp; <a href="README_zh_CN.md">中文完整版</a> &nbsp;|&nbsp; <a href="https://md.yhsun.cn/">Demo</a></p>

A Markdown editor that removes the learning curve — insert formatted text, LaTeX formulas, and diagrams without memorizing any syntax. With intelligent search and AI assistance, everything is just a few clicks away.

Real-time collaboration, AI-assisted writing, and a smooth editing experience — all wrapped in a beautiful Material Design interface.
The Android client is built with Tauri mobile and shipped as an APK.

If you find this useful, please star the repo.

[![Build and Deploy](https://github.com/sunhouy/EasyPocketMD/actions/workflows/deploy.yml/badge.svg)](https://github.com/sunhouy/EasyPocketMD/actions/workflows/deploy.yml)
[![Build Tauri App](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-tauri.yml/badge.svg)](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-tauri.yml)
[![codecov](https://codecov.io/gh/sunhouy/EasyPocketMD/graph/badge.svg?token=8E02GDKIKQ)](https://codecov.io/gh/sunhouy/EasyPocketMD)
![NPM Downloads](https://img.shields.io/npm/dw/easypocketmd)


[![Python 3.6+](https://img.shields.io/badge/python-3.6+-blue.svg)](https://www.python.org/downloads/)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

## Table of Contents
- [Features](#features)
- [Quick Start](#quick-start)
- [Comparison](#how-we-compare)
- [Architecture](#project-architecture)
- [Demo](#demo)
- [License](#license)

## Features

### AI Integration

- AI Writing Assistant: Help write, rewrite, auto-format, and even generate PPT slides from your document.
![AI Writing Assistant](assets/readme/aigenppt.gif)
- Smart Charts and Formulas: Generate LaTeX formulas and diagrams with AI prompts.
![AI Charts & Formulas](assets/readme/aigenformula.gif)

### Collaboration

- Real-time Collaboration: Share documents and work together seamlessly.
![Real-time Collaboration](assets/readme/share.gif)
- Encrypted Video Call: Built-in two-person encrypted video call with dual-stack IPv6 support.
![Encrypted Video Call](assets/readme/videocall.gif)

### Editing Experience
- Three Preview Modes: WYSIWYG, live rendering, and split-screen preview.
- Efficient Editing: Quick insertion of Markdown, LaTeX formulas, and charts. Full-text search and file diff support.
![Editing Experience](assets/readme/insert.gif)
- Version Control: Browse history and compare differences between versions.
![Version Control](assets/readme/history.gif)

### Compatibility and Design
- Cross Platform: Works seamlessly across devices.
![Cross Platform](assets/readme/1_1.png)
- File Import and Export: Import local documents; export to TXT, DOC, PDF, and more.
- Cloud Print: Print remotely via the cloud print client.
![Cloud Print](assets/readme/cloudprint.gif)
- Available on Windows, Linux, Android and the web.
- Modern UI: Clean Material Design with day/night mode support.

## Quick Start
### Prerequisites
- Node.js >= 18.0
- Python >= 3.6
- MySQL >= 5.7
- Redis >= 6.0
- npm >= 9.0

### Installation

1. Clone the repository
```bash
git clone https://github.com/sunhouy/EasyPocketMD.git
cd md
```

2. Install Node.js dependencies
```bash
npm install
```

3. Copy the example configuration file and edit it with your own values:
```
cp .env.example .env
```

4. Set up databases
Create the MySQL database and tables. You can find the schema in db.sql. Ensure Redis is running.

5. Build the frontend
```bash
npm run build
```

6. Start the application
```bash
npm start
```
For production (using PM2):
```bash
npm install -g pm2
pm2 start api/server.js --name "easypocketmd"
```

### Tauri Android Build

After installing the Tauri mobile prerequisites, build the Android APK with:
```bash
npm run tauri:android:init
npm run tauri:android:build
```

## How We Compare

| Feature                     | Ours | Typora | Obsidian | Notion | VS Code | Joplin                 |
|----------------------------|------|--------|----------|--------|---------|------------------------|
| Data Privacy               | Local + Cloud | Local | Local | Cloud-only | Local | Local + Cloud optional |
| AI Writing Assistant       | Yes  | No     | No (plugin) | No   | No (plugin) | No                  |
| AI Charts and Formulas     | Yes  | No     | No       | No     | No      | No                     |
| AI PPT Generation          | Yes  | No     | No       | No     | No      | No                     |
| Mobile Experience          | First-class | Basic | Basic | Good | None    | Basic                  |
| Real-time Collaboration    | Yes (E2EE) | No | No     | Yes    | Yes (Live Share) | No             |
| Encrypted Video Call       | Yes  | No     | No       | No     | No      | No                     |
| Cloud Print                | Yes  | No     | No       | No     | No      | No                     |
| Price                      | Free / Open Source | 15 USD one-time | Free / 50 USD yearly sync | Free tier | Free | Free |

## Project Architecture

The project uses a JavaScript + Python architecture. The backend is implemented with Node.js, while the cloud printing server and client are implemented with Python. The frontend is developed with native JavaScript.
```
api/     Backend API interfaces
assets/  Static application resources
css/     Frontend CSS styles
js/      Frontend JavaScript scripts
print/   Cloud printing server and client code
scripts/ Deployment scripts
tests/   Test scripts
```

## Demo

<https://md.yhsun.cn/>

## Contact
18763177732@139.com

## License
This project is licensed under the MIT License.

## Acknowledgements
Built with modern web technologies and open source tools.

See [DEPENDENCIES.md](./DEPENDENCIES.md) for the complete list of dependencies and licenses.
