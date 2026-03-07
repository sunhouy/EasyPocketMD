# markdown
[![Build and Deploy](https://github.com/sunhouy/markdown/actions/workflows/deploy.yml/badge.svg)](https://github.com/sunhouy/markdown/actions/workflows/deploy.yml)

基于Vditor的移动端轻量化在线markdown编辑器，可进行多文件管理。支持可视化插入格式、公式、图表，上传文件和图片，降低学习和操作门槛；支持多端文件同步，历史版本，文件分享，日间、夜间模式切换，导入本地文件，导出文档，云打印功能

项目采用JavaScript+Python架构，登录注册、文件上传、分享、历史版本等后端使用node实现，云打印服务端和客户端使用Python实现。
### 使用
网页提供日间模式和夜间模式两种配色
<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="api/demo/main_light.png" alt="日间模式" width="200"/>
  <img src="api/demo/main_dark.png" alt="夜间模式" width="200"/>
</div>

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="api/demo/mode.png" alt="切换编辑器模式" width="200"/>
  <img src="api/demo/cloud_print.png" alt="云打印" width="200"/>
  <img src="api/demo/share.png" alt="分享" width="200"/>
  <img src="api/demo/output.png" alt="导出格式" width="200"/>
</div>

<div style="display: flex; justify-content: center; gap: 20px;">
  <img src="api/demo/format.png" alt="格式" width="200"/>
  <img src="api/demo/insert.png" alt="插入" width="200"/>
  <img src="api/demo/formula.png" alt="公式" width="200"/>
  <img src="api/demo/diagram.png" alt="图表" width="200"/>
</div>

### 部署
- 本网站通过Github Actions实现自动测试和部署。请在网页目录下添加.env文件存储敏感信息，格式如下。
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
- print文件夹下放置Python后端和打印客户端脚本。print_server.py需要部署在服务器上。通过`python3 start_print_service.py`命令启动服务器脚本。请自行部署ssl证书，并通过反向代理映射到8770端口。
- 运行打印客户端前需要安装`wkhtmltox`用于html转换为pdf，否则云打印客户端可能无法正确运行。

### Demo
https://md.yhsun.cn/
`测试账号test，测试密码123456`

### 联系
`18763177732@139.com`