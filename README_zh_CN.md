# EasyPocketMD

极速，跨平台，易上手的 Markdown 编辑器，支持Windows/Linux/Android/ios以及网页端。

[![Build and Deploy](https://github.com/sunhouy/EasyPocketMD/actions/workflows/deploy.yml/badge.svg)](https://github.com/sunhouy/EasyPocketMD/actions/workflows/deploy.yml)
[![Build Android APK](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-android.yml/badge.svg)](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-android.yml)
[![Build Electron App](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-electron.yml/badge.svg)](https://github.com/sunhouy/EasyPocketMD/actions/workflows/build-electron.yml)

<p align="center"><a href="README.md">English</a> &nbsp;|&nbsp; <a href="https://md.yhsun.cn/">Demo</a></p>

<br />

这个项目是我投入了大量时间和心血的作品，我希望它能真正帮助到大家。如果你觉得它有用，或者认可我的努力，请给一个 ⭐️ Star 支持我！你的每一个 Star 都是我持续改进的动力，也是对我最大的鼓励。

## 优势

### 在任何地方使用 Markdown

无论是手机还是电脑，都可以使用 EasyPocketMD 来编辑 Markdown 文档。多平台界面采用统一的设计风格，给您一致的操作体验。

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="readme/1_1.png" height="300px"/>
  <img src="readme/1_2.png" height="300px"/>
</div>

### 零学习成本，直接上手

不需记忆任何 Markdown 语法，底部的工具栏提供了常用的格式插入按钮，如加粗、斜体、标题、列表、引用、代码块、链接、图片等，一键即可插入。支持所见即所得 / 即时渲染 / 分屏预览三种操作模式，总有一个选择适合您。

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="readme/2_1.png" height="300px"/>
  <img src="readme/2_2.png" height="300px"/>
</div>

### 丰富的拓展支持

编辑器极速渲染latex公式，mermaid图表，甚至是五线谱和化学方程式。编辑的文档可以直接导出HTML和PDF格式，并极其方便的设置您想要的格式。word能做的，这里都能做，并且更快，更轻量。您本地的txt和markdown文档可以直接导入，在这里继续编辑。

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="readme/3_1.png" height="300px"/>
  <img src="readme/3_2.png" height="300px"/>
</div>

### 永不会担心文件丢失

所有编辑的文档都将自动保存到本地数据库，如果登陆了账户，会自动与服务器同步，并跨设备同步所有内容。如果不同设备的文件冲突了，我们会提示您决定使用哪个版本。我们会实时保存您做的任何修改，即使突然关闭编辑器或重启电脑，也不会丢失任何数据。我们还会记录历史版本，您可以随时查看和恢复到之前的状态。

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="readme/4_1.png" height="300px"/>
  <img src="readme/4_2.png" height="300px"/>
</div>

### 领先的云打印功能

在装有打印机的电脑上安装云打印客户端，您可以在任何设备上使用云打印功能将文档打印出来。在手机上，您可以预览文档打印出后的状态，并进行所有配置。强大的AI智能排版功能更可以节省您的时间，让您只须聚焦文档的编写，剩下的交给我们。

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="readme/5_1.png" height="300px"/>
  <img src="readme/5_2.png" height="300px"/>
</div>

### 强大的隐私保护

您的文件和上传的任何内容都会加密存储在本地和服务器中。您可以分享文档，并进行访问时间和权限的管理。我们使用最新的库，并随时修复安全漏洞，确保您的隐私不被泄露。

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="readme/6_1.png" height="300px"/>
  <img src="readme/6_2.png" height="300px"/>
</div>

### 高度个性化的体验

底部工具栏的按钮，字体大小，是否显示大纲，日间/夜间模式，语言，都可以根据个人喜好进行设置。我们会保存您的选择，下次打开时自动应用。您可以在设置中随时修改这些选项。

## 项目架构

项目采用JavaScript+Python架构，后端使用nodejs实现，云打印服务端和云打印客户端使用Python实现。前端原生js开发，保障了优秀的性能。
api/ 后端api接口
assets/ Capacitor应用资源
css/ 前端css样式
js/ 前端js脚本
print/ 云打印服务端和客户端代码
scripts/ 部署脚本
tests/ 测试脚本

## 部署

本网站通过Github Actions自动测试和部署。请在网页目录下添加.env文件存储敏感信息，格式如下。

```
DB_HOST=数据库地址
DB_PORT=数据库端口
DB_USER=数据库用户名
DB_PASSWORD=数据库密码
DB_NAME=数据库名
ADMIN_USER=管理员用户名
ADMIN_PASSWORD=管理员密码
BASE_URL=网站域名，例如https://md.yhsun.cn
```

每次push都会触发自动构建上传代码到服务器，electron应用安卓应用通过打tag触发：
```bash
git tag v1.3
git push origin v1.3
```

## Demo

<https://md.yhsun.cn/>
`测试账号test，测试密码123456`

## 联系

`18763177732@139.com`
