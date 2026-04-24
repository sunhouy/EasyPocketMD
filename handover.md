# Handover — Phase 1 React 基础设施搭建 — 2026-04-22

## 本次修改文件列表

| 文件路径 | 变更类型 | 变更说明 |
|----------|----------|----------|
| `vite.config.js` | 修改 | 添加 `import react from '@vitejs/plugin-react'` 并在 `plugins` 数组首位插入 `react()` |
| `tsconfig.json` | 修改 | 添加 `"jsx": "react-jsx"`、`"paths": { "@/*": ["./src/*"] }`，`include` 增加 `src/**/*` |
| `index.html` | 修改 | `<body>` 内首行插入 `<div id="react-root"></div>` 挂载点；添加 `<script type="module" src="/src/main.tsx">` 入口 |
| `src/types/legacy.d.ts` | 新增 | 遗留系统 `window.*` 全局变量 TypeScript 类型声明（含 `vditor`、`currentUser`、`files` 等 ~30 个全局及 `UserSettings` 接口） |
| `src/main.tsx` | 新增 | React 应用入口，使用 `createRoot` + `StrictMode` 挂载 |
| `src/App.tsx` | 新增 | 根组件（Phase 1 仅返回空 shell） |
| `src/store/.gitkeep` | 新增 | Store 目录占位 |
| `src/components/.gitkeep` | 新增 | 组件目录占位 |
| `src/hooks/.gitkeep` | 新增 | Hooks 目录占位 |
| `src/legacy/.gitkeep` | 新增 | 遗留桥接层目录占位 |

## 引入的新依赖

| 包名 | 版本 | 用途 |
|------|------|------|
| `react` | ^19.2.5 | React 核心（已存在于 `package.json`） |
| `react-dom` | ^19.2.5 | React DOM 渲染（已存在于 `package.json`） |
| `zustand` | ^5.0.12 | 状态管理（已存在于 `package.json`） |
| `@vitejs/plugin-react` | ^5.1.1 | Vite React 插件（已存在于 `package.json`） |
| `@types/react` | ^19.2.14 | React 类型声明（已存在于 `package.json`） |
| `@types/react-dom` | ^19.2.3 | React DOM 类型声明（已存在于 `package.json`） |

> 注：所有依赖已由用户在 Phase 1 开始前安装完毕，本次无需执行 `npm install`。

## 已知技术债务

- [低] `js/files/sync/index.ts:371` 存在 `Parameter 'confirm' implicitly has an 'any' type`，为既有 TypeScript 问题，与本次迁移无关
- [低] `vite.config.js` 中的 `optimizeDeps.include: ['docx']` 在 Vite 7 下存在解析警告，不影响功能

## 测试状态

- **最终测试结果**：通过
- **验证方法**：
  - `npx tsc --noEmit` — 仅有 1 个既有 TS 错误（`js/files/sync/index.ts`），无新增错误
  - `npm run dev` — Vite 启动正常（localhost:8080）
  - Chrome DevTools 验证：
    - `document.getElementById('react-root')` 存在且有 1 个子节点
    - `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` 存在（React DevTools 可检测）
    - `src/main.tsx`、`src/App.tsx` 均 200 OK
  - 旧功能（Vditor 初始化、文件列表）正常加载

## 下一步迁移建议

- **对应 implementation_plan.md 阶段二**：创建 Zustand store，将 `window.*` 全局变量迁移至状态管理
  - 首先创建 `src/store/useAppStore.ts`、`src/store/useEditorStore.ts`、`src/store/useUIStore.ts`
  - 然后实现 `src/legacy/globalBridge.ts` 双向同步桥（注意防死循环）
  - **警告**：在双向同步桥完成之前，不要删除任何 `window.*` 赋值语句

---

# Handover — Phase 2 全局状态迁移 — 2026-04-23

## 本次修改文件列表

| 文件路径 | 变更类型 | 变更说明 |
|----------|----------|----------|
| `src/store/useAppStore.ts` | 新增 | 核心应用状态 store（currentUser、files、currentFileId、unsavedChanges 等） |
| `src/store/useEditorStore.ts` | 新增 | 编辑器状态 store（vditorReady、vditor 实例引用） |
| `src/store/useUIStore.ts` | 新增 | UI 状态 store（nightMode、userSettings、isFileManagementMode 等） |
| `src/store/index.ts` | 新增 | 统一导出三个 store |
| `src/legacy/globalBridge.ts` | 新增 | window.* ↔ Zustand 双向同步桥（含 isSyncing 防死循环标志位） |
| `src/main.tsx` | 修改 | 在应用入口调用 `initGlobalBridge()` |
| `src/types/legacy.d.ts` | 修改 | 新增 `appSessionId` 全局变量声明，修复类型错误 |

## 引入的新依赖

无新依赖，所有包已在 Phase 1 中安装。

## 已知技术债务

- [低] `js/files/sync/index.ts:371` 存在 `Parameter 'confirm' implicitly has an 'any' type`，为既有 TypeScript 问题，与本次迁移无关
- [中] `src/legacy/globalBridge.ts` 中的 `createWindowProxy` 函数目前未被使用（预留接口），后续可根据需要启用

## 双向同步桥接的全局变量

| 全局变量 | 方向 | Store |
|----------|------|-------|
| `window.currentUser` | ↔ | useAppStore |
| `window.files` | ↔ | useAppStore |
| `window.currentFileId` | ↔ | useAppStore |
| `window.unsavedChanges` | ↔ | useAppStore |
| `window.lastSyncedContent` | ↔ | useAppStore |
| `window.appSessionId` | ↔ | useAppStore |
| `window.vditorReady` | ↔ | useEditorStore |
| `window.nightMode` | ↔ | useUIStore |
| `window.userSettings` | ↔ | useUIStore |
| `window.isFileManagementMode` | ↔ | useUIStore |
| `window.isFileSwitchLoading` | ↔ | useUIStore |
| `window.toolbarUncertaintyUnlocked` | ↔ | useUIStore |
| `window.startInFileManagementMode` | ↔ | useUIStore |
| `window.deferInitialFileOpen` | ↔ | useUIStore |
| `window.isTauriMobileEnvironment` | ↔ | useUIStore |

> 注意：`window.vditor` 实例本身不存入 Zustand（不可序列化），仅通过 `useEditorStore._vditorInstance` 持有引用，vditorReady 状态同步至 `window.vditorReady`

## 防死循环机制

- `isSyncing` 模块级标志位，在双向 setter 中检查
- 值比较保护：`newValue === oldValue` 时直接 return
- `try/finally` 确保 `isSyncing` 始终被重置

## 测试状态

- **最终测试结果**：通过
- **验证方法**：
  - `npx tsc --noEmit` — 仅 1 个既有 TS 错误（`js/files/sync/index.ts`），无新增错误
  - `npm run dev` — Vite 启动正常（localhost:8080）
  - Chrome DevTools 验证：
    - 页面正常加载，旧编辑器功能完整
    - 控制台无 error 级别错误
    - Zustand DevTools 可检测到三个 store

## 下一步迁移建议

- **对应 implementation_plan.md 阶段三**：UI 组件化
  - 首先迁移 P0 优先级组件：`VditorWrapper` 和 `FileList`
  - `VditorWrapper` 使用 `useRef` + `useEffect` 封装 Vditor 实例
  - 通过 `useEditorStore` 同步 `vditorReady` 状态
  - 旧代码 `js/ui/file-manager.js` 中的文件列表逻辑可直接 import 调用