# EasyPocketMD

A fast, cross-platform, and user-friendly Markdown editor that supports Windows, Linux, Android, iOS, and the web.

[!\[Build and Deploy\](https://github.com/sunhouy/EasyPocketMD/actions/workflows/deploy.yml/badge.svg)](https://github.com/sunhouy/EasyPocketMD/actions/workflows/deploy.yml)
[!\[Build Android APK\](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-android.yml/badge.svg)](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-android.yml)
[!\[Build Electron App\](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-electron.yml/badge.svg)](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-electron.yml)
[!\[Dependabot Updates\](https://github.com/sunhouy/EasyPocketMD/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/sunhouy/EasyPocketMD/actions/workflows/dependabot/dependabot-updates)

<p align="center"><a href="README_zh_CN.md">中文</a> &nbsp;|&nbsp; <a href="https://md.yhsun.cn/">Demo</a></p>

<br />

这个项目是我投入了大量时间和心血的作品，我希望它能真正帮助到大家。如果你觉得它有用，或者认可我的努力，请给一个 ⭐️ Star 支持我！你的每一个 Star 都是我持续改进的动力，也是对我最大的鼓励。谢谢！

This project is something I’ve invested significant time and effort into, and I truly hope it can be helpful to others. If you find it useful or appreciate my work, please give it a ⭐️ Star to support me! Every Star you give is a huge encouragement and motivation for me to keep improving.

## Advantages

### Use Markdown Anywhere

Whether on mobile or computer, you can use EasyPocketMD to edit Markdown documents. The multi-platform interface adopts a unified design style, providing you with a consistent operating experience.

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="readme/1_1.png" width="500"/>
  <img src="readme/1_2.png" width="200"/>
</div>

### Zero Learning Curve, Start Instantly

No need to memorize any Markdown syntax. The bottom toolbar provides buttons for commonly used formatting options, such as bold, italic, headings, lists, quotes, code blocks, links, images, etc., allowing one-click insertion. Supports three operation modes: WYSIWYG / Instant Rendering / Split-Screen Preview, there's always an option that suits you.

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="readme/2_1.png" width="500"/>
  <img src="readme/2_2.png" width="200"/>
</div>

### Rich Extension Support

The editor rapidly renders LaTeX formulas, mermaid diagrams, and even musical scores and chemical equations. Edited documents can be directly exported to HTML and PDF formats, with extremely convenient formatting options. What Word can do, this can do too, but faster and more lightweight. Your local txt and Markdown documents can be directly imported and edited here.

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="readme/3_1.png" width="200"/>
  <img src="readme/3_2.png" width="200"/>
</div>

### Never Worry About File Loss

All edited documents are automatically saved to the local database. If logged into an account, they will automatically sync with the server and synchronize all content across devices. If files conflict on different devices, we will prompt you to decide which version to use. We save any modifications you make in real-time; even if the editor is suddenly closed or the computer is restarted, no data will be lost. We also keep version history, allowing you to view and restore to previous states at any time.

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="readme/4_1.png" width="400"/>
  <img src="readme/4_2.png" width="400"/>
</div>

### Leading Cloud Printing Features

Install the cloud printing client on a computer connected to a printer, and you can use the cloud printing function from any device to print documents. On your mobile phone, you can preview how the document will look after printing and configure all settings. The powerful AI intelligent layout function saves you time, allowing you to focus on writing the document while we handle the rest.

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="readme/5_1.png" width="200"/>
  <img src="readme/5_2.png" width="200"/>
</div>

### Strong Privacy Protection

Your files and any uploaded content are encrypted and stored locally and on the server. You can share documents and manage access time and permissions. We use the latest libraries and promptly fix security vulnerabilities to ensure your privacy is not compromised.

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="readme/6_1.png" width="200"/>
  <img src="readme/6_2.png" width="500"/>
</div>

### Highly Personalized Experience

The buttons on the bottom toolbar, font size, whether to show the outline, day/night mode, and language can all be set according to personal preference. We save your choices and automatically apply them the next time you open the app. You can modify these options at any time in the settings.

## Project Architecture

The project uses a JavaScript + Python architecture. The backend is implemented with Node.js, while the cloud printing server and client are implemented with Python. The frontend is developed with native JavaScript, ensuring excellent performance.
api/ Backend API interfaces
assets/ Capacitor application resources
css/ Frontend CSS styles
js/ Frontend JavaScript scripts
print/ Cloud printing server and client code
scripts/ Deployment scripts
tests/ Test scripts

## Deployment

- This website is automatically tested and deployed via GitHub Actions. Please add a .env file in the web directory to store sensitive information, formatted as follows.

```
DB_HOST=Database address
DB_PORT=Database port
DB_USER=Database username
DB_PASSWORD=Database password
DB_NAME=Database name
ADMIN_USER=Administrator username
ADMIN_PASSWORD=Administrator password
BASE_URL=Website domain, e.g., https://md.yhsun.cn
```

## Demo

<https://md.yhsun.cn/>
`Test account test, test password 123456`

## Contact

`18763177732@139.com`
