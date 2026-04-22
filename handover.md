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
