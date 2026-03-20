# EasyPocketMD

[![Build and Deploy](https://github.com/sunhouy/EasyPocketMD/actions/workflows/deploy.yml/badge.svg)](https://github.com/sunhouy/EasyPocketMD/actions/workflows/deploy.yml)

<p align="center"><a href="README_zh_CN.md">中文</a> &nbsp;|&nbsp; <a href="https://md.yhsun.cn/">Demo</a></p>

<br />

这个项目是我投入了大量时间和心血的作品，我希望它能真正帮助到大家。如果你觉得它有用，或者认可我的努力，请给一个 ⭐️ Star 支持我！你的每一个 Star 都是我持续改进的动力，也是对我最大的鼓励。谢谢！

This project is something I’ve invested significant time and effort into, and I truly hope it can be helpful to others. If you find it useful or appreciate my work, please give it a ⭐️ Star to support me! Every Star you give is a huge encouragement and motivation for me to keep improving.

A completely free and open-source lightweight online Markdown editor for mobile devices, built based on Vditor, supporting multi-file management. It provides a visual format insertion method, supports image and file uploads, LaTeX formula referencing, Mermaid chart drawing, lowering the learning and operation threshold. At the same time, the editor also supports multi-device file synchronization, folder creation, historical version management, file sharing, and day/night mode switching. It provides three editing modes (WYSIWYG / instant rendering / split-screen preview), and supports document import, export, and file cloud printing functions.

The project adopts a JavaScript+Python architecture. The backend for login registration, file upload, sharing, historical versions, etc., is implemented using Node, and the cloud printing server and client are implemented using Python.

### Usage

The webpage provides two color schemes: day mode and night mode

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="api/demo/main_light.png" alt="Day mode" width="200"/>
  <img src="api/demo/main_dark.png" alt="Night mode" width="200"/>
</div>

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="api/demo/mode.png" alt="Switch editor mode" width="200"/>
  <img src="api/demo/cloud_print.png" alt="Cloud print" width="200"/>
  <img src="api/demo/share.png" alt="Share" width="200"/>
  <img src="api/demo/output.png" alt="Export format" width="200"/>
</div>

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="api/demo/format.png" alt="Format" width="200"/>
  <img src="api/demo/insert.png" alt="Insert" width="200"/>
  <img src="api/demo/formula.png" alt="Formula" width="200"/>
  <img src="api/demo/diagram.png" alt="Diagram" width="200"/>
</div>

### Deployment

- This website implements automatic testing and deployment through GitHub Actions. Please add a .env file in the webpage directory to store sensitive information, in the following format.

```
DB_HOST=Database address
DB_PORT=Database port
DB_USER=Database username
DB_PASSWORD=Database password
DB_NAME=Database name
ADMIN_USER=Admin username
ADMIN_PASSWORD=Admin password
BASE_URL=Website domain, for example https://md.yhsun.cn
```

- Place the Python backend and printing client scripts in the print folder. print\_server.py needs to be deployed on the server. Start the server script with the `python3 start_print_service.py` command. Please deploy the SSL certificate yourself and map it to port 8770 through a reverse proxy.
- Before running the printing client, you need to install `wkhtmltox` for HTML to PDF conversion; otherwise, the cloud printing client may not run correctly.

### Contact

`18763177732@139.com`
