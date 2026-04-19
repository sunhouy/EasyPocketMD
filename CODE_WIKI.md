# EasyPocketMD Code Wiki

## 项目概述

**项目名称**: EasyPocketMD  
**版本**: 2.8.8  
**描述**: 一款几乎零学习成本的 Markdown 编辑器，无需记忆语法即可轻松插入格式化文本、LaTeX 公式和图表。配合智能搜索与 AI 助手，常用功能几步完成。实时协作、AI 辅助写作与流畅编辑体验整合在美观的 Material Design 界面中。

**GitHub 地址**: https://github.com/sunhouy/EasyPocketMD  
**主页**: https://yhsun.cn/  
**许可证**: MIT

---

## 项目架构

### 技术栈
- **前端**: TypeScript + Vite + Vditor (Markdown 编辑器)
- **后端**: Node.js + Express
- **数据库**: MySQL (数据存储) + Redis (缓存)
- **跨平台**: Tauri (桌面端/移动端)
- **实时协作**: WebSocket (ws)
- **高性能处理**: WebAssembly (C/C++)
- **打印服务**: Python

### 目录结构

```
/workspace
├── api/                      # 后端 API
│   ├── config/              # 配置文件
│   │   ├── db.ts           # MySQL 数据库配置
│   │   └── redis.ts        # Redis 缓存配置
│   ├── middleware/          # 中间件
│   │   └── rateLimiter.ts  # API 限流
│   ├── models/              # 数据模型
│   │   ├── ApiManager.ts
│   │   ├── FileManager.ts  # 文件管理核心
│   │   ├── HistoryManager.ts
│   │   ├── ShareManager.ts
│   │   └── User.ts
│   ├── realtime/            # 实时服务
│   │   ├── reference.ts
│   │   └── shareCollabServer.ts  # 共享协作 WebSocket 服务
│   ├── routes/              # API 路由
│   │   ├── admin.ts
│   │   ├── ai.ts
│   │   ├── auth.ts
│   │   ├── code-runner.ts
│   │   ├── convert.ts
│   │   ├── files.ts
│   │   ├── gatus.ts
│   │   ├── ppt-export.ts
│   │   ├── share.ts
│   │   └── user_files.ts
│   ├── services/            # 业务服务
│   │   └── pexels-service.ts
│   ├── utils/               # 工具函数
│   │   ├── auth.ts
│   │   ├── cache.ts
│   │   ├── htmlGenerator.ts
│   │   └── sensitiveFilter.ts
│   ├── api_info.json
│   └── server.ts            # 后端服务器入口
├── assets/                  # 静态资源
├── css/                     # 前端样式
├── js/                      # 前端代码
│   ├── files/               # 文件管理相关
│   │   ├── conflict/       # 冲突处理
│   │   ├── external/       # 外部文件
│   │   ├── sync/           # 文件同步
│   │   ├── tree/           # 文件树
│   │   ├── autoSave.ts
│   │   ├── runtime-core.ts
│   │   ├── runtime.ts
│   │   ├── saveState.ts
│   │   └── types.ts
│   ├── page/                # 页面相关
│   ├── ui/                  # UI 组件
│   │   ├── ai-assistant.ts # AI 助手
│   │   ├── ai.ts
│   │   ├── chart.ts
│   │   ├── dialog.ts
│   │   ├── docx-generator.ts
│   │   ├── echarts-loader.ts
│   │   ├── export.ts
│   │   ├── file-manager.ts
│   │   ├── image-compressor.ts
│   │   ├── image-inline-tools.ts
│   │   ├── insert-picker.ts
│   │   ├── pdf-generator.ts
│   │   ├── ppt-generator.ts
│   │   ├── print.ts
│   │   ├── render.ts
│   │   ├── share.ts
│   │   ├── slash-builtin-index.ts
│   │   ├── slash-command.ts
│   │   └── upload.ts
│   ├── appLifecycle.ts      # 应用生命周期
│   ├── auth.ts              # 认证
│   ├── code-runner.ts       # 代码运行
│   ├── main.ts              # 前端主入口
│   └── wasm-text-engine-gateway.ts  # WASM 引擎网关
├── print/                   # 打印服务 (Python)
│   ├── print_client.py
│   ├── print_gui.py
│   ├── print_server.py
│   └── requirements.txt
├── shared/                  # 共享模块
│   ├── ppt-data-normalizer.ts
│   └── ppt-style-calculator.ts
├── src-tauri/               # Tauri 跨平台应用
│   ├── src/
│   │   ├── lib.rs
│   │   └── main.rs
│   └── Cargo.toml
├── tests/                   # 测试
│   ├── integration/         # 集成测试
│   └── unit/                # 单元测试
├── types/                   # 类型定义
├── wasm_text_engine/        # WebAssembly 文本引擎
│   ├── src/                 # C/C++ 源代码
│   │   ├── image_compressor.cpp
│   │   ├── text_engine.cpp
│   │   └── wasm_bindings.cpp
│   └── js/                  # JS 绑定
├── package.json
├── vite.config.ts
├── tsconfig.json
├── db.sql                   # 数据库结构
└── entry.ts
```

---

## 核心模块说明

### 1. 后端服务器 (api/server.ts)

**主要功能**:
- Express HTTP 服务器初始化
- 路由挂载与限流控制
- WebSocket 实时协作服务
- 前端静态文件服务
- 健康检查端点

**核心配置**:
- 监听端口: 环境变量 `PORT` 或默认 `3000`
- 限流配置: AI 接口、认证接口、文件上传等有独立限流策略
- 静态文件服务路径: `/uploads`, `/avatars`, `/screenshots`, `/user_files`

**重要路由**:
- `/api/ai` - AI 相关接口
- `/api/auth` - 认证接口 (登录、注册)
- `/api/files` - 文件管理接口
- `/api/share` - 共享协作接口
- `/api/convert` - 文件格式转换
- `/api/ppt-export` - PPT 导出
- `/api/code-runner` - 代码运行
- `/api/health` - 健康检查

---

### 2. 文件管理 (api/models/FileManager.ts)

**核心功能**:
- 用户文件列表获取 (含缓存机制)
- 文件内容读取与缓存
- 文件保存 (含乐观锁防止冲突)
- 文件删除 (含历史记录清理)
- 文件批量同步
- 内容哈希计算 (用于冲突检测)

**核心方法**:

| 方法名 | 功能描述 | 关键特性 |
|--------|----------|----------|
| `getUserFiles(username)` | 获取用户所有文件 | Redis 缓存优先 |
| `getFileContent(username, filename)` | 获取文件内容 | Redis 缓存优先 |
| `saveFile(username, filename, content, optimisticLock)` | 保存文件 | 乐观锁、事务 |
| `saveFileWithHistory(username, filename, content, createHistory)` | 保存并创建历史 | 自动保存历史 |
| `deleteFile(username, filename)` | 删除文件 | 事务、清理历史 |
| `syncFiles(username, files)` | 批量同步文件 | 事务处理 |

**乐观锁机制**:
- 支持 `base_content_version` (版本号)
- 支持 `base_last_modified` (时间戳)
- 支持 `base_hash` (内容 SHA256 哈希)
- 冲突时返回 `409` 状态码及服务器最新版本

---

### 3. 实时协作 (api/realtime/shareCollabServer.ts)

**核心功能**:
- WebSocket 连接管理
- 共享房间管理
- 实时文档同步
- 在线用户 presence 广播
- 视频通话信令处理 (WebRTC)

**WebSocket 消息类型**:

| 消息类型 | 用途 | 权限要求 |
|----------|------|----------|
| `heartbeat` | 心跳保活 | - |
| `sync_request` | 请求同步文档 | - |
| `update_content` | 更新文档内容 | 可编辑权限 |
| `video_call_invite` | 视频通话邀请 | 可编辑权限 |
| `video_call_response` | 通话响应 | 可编辑权限 |
| `video_signal` / `video_offer` / `video_answer` / `video_ice_candidate` | WebRTC 信令 | 可编辑权限 |
| `video_call_hangup` | 挂断通话 | 可编辑权限 |
| `video_room_join` / `video_room_leave` / `video_room_signal` | 多人视频房间 | 可编辑权限 |

**主要流程**:
1. 连接建立 → 验证共享 ID 和密码
2. 发送 ready 消息 (文档内容、权限等)
3. 在线用户 presence 广播
4. 接收客户端消息并处理
5. 连接断开后清理

---

### 4. 前端文件管理 (js/files/)

**核心模块**:

| 文件 | 功能描述 |
|------|----------|
| `index.ts` | 文件管理入口 |
| `runtime-core.ts` | 文件管理核心运行时 |
| `runtime.ts` | 运行时逻辑 |
| `autoSave.ts` | 自动保存机制 |
| `saveState.ts` | 保存状态管理 |
| `sync/index.ts` | 文件同步逻辑 |
| `conflict/index.ts` | 冲突处理 |
| `external/index.ts` | 外部文件处理 |
| `tree/index.ts` | 文件树渲染 |

---

### 5. UI 组件 (js/ui/)

**主要组件**:

| 组件 | 功能描述 |
|------|----------|
| `ai-assistant.ts` | AI 助手主界面 |
| `ai.ts` | AI 功能集成 |
| `chart.ts` / `echarts-loader.ts` | 图表相关 |
| `dialog.ts` | 对话框组件 |
| `export.ts` | 导出功能 |
| `file-manager.ts` | 文件管理器 |
| `pdf-generator.ts` | PDF 生成 |
| `ppt-generator.ts` | PPT 生成 |
| `print.ts` | 打印功能 |
| `share.ts` | 共享功能 |
| `slash-command.ts` / `slash-builtin-index.ts` | 斜杠命令 |

---

### 6. WebAssembly 引擎 (wasm_text_engine/)

**功能**:
- 文本处理高性能计算
- 图像压缩 (image_compressor.cpp)
- 文本引擎 (text_engine.cpp)
- 斜杠命令索引 (slash_command_index.cpp)
- WASM 绑定 (wasm_bindings.cpp)

**构建脚本**:
- `build_wasm.sh` - 构建 WASM 模块
- `build_image_compressor.sh` - 构建图像压缩模块

---

## 数据库设计

### 核心表结构 (db.sql 参考)

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `users` | 用户信息 | id, username, password_hash, salt |
| `user_files` | 用户文件 | id, username, filename, content, content_version, last_modified |
| `file_history` | 文件历史 | id, user_id, filename, content, created_at |
| `file_content` | 文件内容存储 | id, history_id, content |
| `shares` | 共享文档 | id, share_id, filename, username, password, edit_password, edit_policy |

---

## 依赖关系

### 后端核心依赖 (package.json dependencies)

| 依赖包 | 用途 | 版本 |
|--------|------|------|
| `express` | Web 框架 | ^4.18.2 |
| `mysql2` | MySQL 驱动 | ^3.6.5 |
| `ioredis` | Redis 客户端 | ^5.10.1 |
| `ws` | WebSocket 服务器 | ^8.18.0 |
| `jsonwebtoken` | JWT 认证 | ^9.0.3 |
| `bcryptjs` | 密码加密 | ^2.4.3 |
| `multer` | 文件上传 | ^2.1.1 |
| `cors` | CORS 处理 | ^2.8.5 |
| `express-rate-limit` | API 限流 | ^8.3.1 |

### 前端核心依赖

| 依赖包 | 用途 |
|--------|------|
| `vditor` | Markdown 编辑器 |
| `echarts` | 图表库 |
| `markdown-it` | Markdown 渲染 |
| `pdfmake` | PDF 生成 |
| `pptxgenjs` | PPT 生成 |
| `jquery` / `jstree` | DOM 操作 / 文件树 |

### 开发依赖

| 依赖包 | 用途 |
|--------|------|
| `vite` | 构建工具 |
| `typescript` | 类型系统 |
| `jest` / `supertest` / `ts-jest` | 测试框架 |
| `@tauri-apps/cli` | Tauri 工具链 |

---

## 项目运行方式

### 环境要求

- Node.js ≥ 18.0
- Python ≥ 3.6
- MySQL ≥ 5.7
- Redis ≥ 6.0
- npm ≥ 9.0

### 安装与配置

1. **克隆项目**
```bash
git clone https://github.com/sunhouy/EasyPocketMD.git
cd easypocketmd
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境**
```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库、Redis 等信息
```

4. **初始化数据库**
```bash
# 导入 db.sql 到 MySQL 数据库
```

5. **构建 WASM 模块** (可选，开发时可能需要)
```bash
npm run wasm:text:build
npm run wasm:image:build
```

### 开发模式

**前端开发**:
```bash
npm run dev
```

**后端开发**:
```bash
npm start
# 或使用 ts-node
ts-node api/server.ts
```

**Tauri 桌面开发**:
```bash
npm run tauri:dev
```

**Tauri Android 开发**:
```bash
npm run tauri:android:dev
```

### 生产构建

**Web 前端构建**:
```bash
npm run build:web
```

**完整构建** (含 WASM):
```bash
npm run build
```

**Tauri 桌面应用构建**:
```bash
# Windows
npm run build:tauri:win
# Linux
npm run build:tauri:linux
# macOS
npm run build:tauri:mac
```

**Tauri Android APK 构建**:
```bash
npm run tauri:android:build
```

### 运行测试

```bash
# 全部测试
npm test
```

---

## API 接口速查

### 认证接口 (`/api/auth`)

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/register` | 用户注册 |
| POST | `/login` | 用户登录 |

### 文件接口 (`/api/files` / `/api/user_files`)

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/list` | 获取文件列表 |
| GET | `/:filename` | 获取文件内容 |
| POST | `/save` | 保存文件 |
| DELETE | `/:filename` | 删除文件 |
| POST | `/sync` | 批量同步文件 |

### 共享接口 (`/api/share`)

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/create` | 创建共享 |
| GET | `/:shareId` | 获取共享文档 |
| POST | `/update` | 更新共享文档 |
| WebSocket | `/ws` | 实时协作连接 |

### AI 接口 (`/api/ai`)

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/write` | AI 写作 |
| POST | `/edit` | AI 改写 |
| POST | `/format` | AI 排版 |
| POST | `/ppt` | AI 生成 PPT |

### 转换接口 (`/api/convert` / `/api/ppt-export`)

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/to-pdf` | 转换为 PDF |
| POST | `/to-docx` | 转换为 DOCX |
| POST | `/to-ppt` | 转换为 PPT |

---

## 关键特性实现

### 1. 实时协作流程

1. 创建共享链接 → 生成 `shareId`
2. 用户通过链接访问 → 输入密码验证
3. WebSocket 连接 → 接收 ready 消息
4. 编辑文档 → 发送 `update_content` 消息
5. 服务器广播 → 所有客户端收到 `doc_updated`
6. 在线用户 presence → 实时同步

### 2. 文件冲突处理

- **乐观锁机制**: 基于版本号、时间戳或内容哈希
- **冲突检测**: 保存时验证基线版本
- **冲突解决**: 用户选择保留本地或服务器版本，或手动合并
- **差异对比**: 提供可视化 diff 查看

### 3. 缓存策略

- 使用 Redis 缓存用户文件列表
- 缓存文件内容
- 保存/删除后自动失效相关缓存
- 缓存有版本形状校验，防止旧数据问题

### 4. AI 集成

- 写作助手、改写、自动排版
- 公式和图表生成
- PPT 自动生成
- API 限流保护

### 5. 多平台支持

- Web 端
- Windows / Linux / macOS (Tauri)
- Android (Tauri)
- 一致的用户体验

---

## 开发注意事项

1. **TypeScript 配置**: 使用 `tsconfig.json`，支持 CommonJS 和 ESM
2. **Tauri 配置**: `src-tauri/tauri.conf.json` 和 `tauri.android.conf.json`
3. **环境变量**: 所有配置应通过环境变量设置
4. **数据库事务**: 涉及文件、历史记录操作时注意使用事务
5. **WebSocket 连接**: 处理断线重连、心跳超时
6. **测试**: 修改核心功能后运行完整测试套件

---

## 联系方式与资源

- **作者**: sunhouyun
- **邮箱**: sunhouyun@emails.bjut.edu.cn
- **GitHub Issues**: https://github.com/sunhouy/EasyPocketMD/issues
- **演示站点**: https://md.yhsun.cn/
- **官方网站**: https://yhsun.cn/
