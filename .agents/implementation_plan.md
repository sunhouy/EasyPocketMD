# EasyPocketMD → React 迁移计划

## 背景与现状审计

EasyPocketMD 是一个功能完整的 Markdown 编辑器，当前架构特点如下：

| 维度 | 现状 | 迁移挑战 |
|------|------|----------|
| **前端构建** | Vite + 原生 JS | 可直接集成 `@vitejs/plugin-react` |
| **主入口** | `js/main.js`（3,391 行）| 巨型单文件，大量 `window.*` 全局状态 |
| **文件管理核心** | `js/files/runtime-core.ts`（6,565 行，IIFE 模式）| 已部分 TypeScript，但强依赖 `global.*` |
| **UI 层** | `js/ui/`（20 个模块，最大 121KB）| 纯 DOM 操作，无组件抽象 |
| **样式** | `css/styles.css`（单文件 113KB）| 可渐进拆分，无需立刻重写 |
| **编辑器** | Vditor（非 React）| 需要用 `useRef` 桥接 |
| **WASM** | C/C++ 编译的文本引擎 + 图片压缩器 | 纯 JS 调用，可直接 import |
| **跨平台** | Tauri（`js/tauri-bridge.js`）| 保持原有 bridge，React 侧封装 Hook |
| **状态管理** | `window.*` 全局变量（~30 个关键全局）| 迁移至 Zustand（渐进式）|
| **jQuery** | 少量直接引用 | 在 React 层彻底移除 |
| **TypeScript** | `tsconfig.json` 已存在，`allowJs: true` | 可立即扩展，无需全量转换 |

---

## 迁移原则

> [!IMPORTANT]
> **最小破坏性**：后端 `api/`、WASM、Tauri bridge、`shared/` 目录**完全不动**。仅对 `js/` 和 `css/` 做适配性调整，原有逻辑函数原地保留，仅在 React 组件中调用。

> [!NOTE]
> **并行运行策略**：在迁移过程中，旧代码通过 `window.*` 继续运行。新 React 组件通过事件总线（或 Zustand）与旧代码通信，新旧可同时存在。

---

## 分阶段实施步骤

---

### 阶段一：基础设施搭建（1–2 天）

**目标**：在不破坏任何现有功能的前提下，让 React 进入构建管道。

#### 0.5 全局类型定义（新增）

为防止新 React 代码中出现大量的 `any` 类型，首先定义遗留系统的全局接口：

创建 `src/types/legacy.d.ts`:
```ts
interface Window {
  vditor: any;
  vditorReady: boolean;
  currentUser: any;
  files: any[];
  currentFileId: string | null;
  tauriBridge: any;
  wasmTextEngineGateway: any;
  _legacyEditorConfig: any;
  // ... 其他 30 个全局变量
}
```

#### 1.1 安装依赖

```bash
npm install react react-dom
npm install -D @vitejs/plugin-react @types/react @types/react-dom
# 状态管理（轻量，无需 Redux）
npm install zustand
# 可选：React Router（阶段三再安装）
```

#### 1.2 更新 `vite.config.js`

```diff
+ import react from '@vitejs/plugin-react';

  export default defineConfig({
    plugins: [
+     react(),
      viteStaticCopy({ ... }),
      ...
    ]
  })
```

> [!NOTE]
> 原有 `viteStaticCopy`（WASM、Vditor 静态资源复制）和 Service Worker 生成插件**完全保留**，react 插件仅追加。

#### 1.3 更新 `tsconfig.json`

```diff
  {
    "compilerOptions": {
      "target": "ES2022",
+     "jsx": "react-jsx",
+     "paths": {
+       "@/*": ["./src/*"]
+     },
      ...
    },
    "include": [
      "js/**/*",
+     "src/**/*"
    ]
  }
```

#### 1.4 创建 React 应用入口（新建，不修改旧入口）

新建 `src/` 目录作为 React 代码的根，旧的 `js/` 保持不变：

```
src/
├── main.tsx           # React 应用入口
├── App.tsx            # 根组件（初期仅挂载 shell）
├── store/             # Zustand store（阶段二填充）
├── components/        # React 组件（阶段二/三填充）
├── hooks/             # 自定义 Hooks
└── legacy/            # 遗留模块桥接层（见下文）
```

**`index.html` 改造**（仅添加 React 挂载点，原有内容保留）：

```diff
  <body>
+   <div id="react-root"></div>   <!-- React 接管区域 -->
    <div id="app">...</div>        <!-- 现有 DOM 结构，暂时保留 -->
    ...
  </body>
```

**`src/main.tsx`**（React 渐进式挂载）：

```tsx
import { createRoot } from 'react-dom/client';
import App from './App';

const root = document.getElementById('react-root');
if (root) {
  createRoot(root).render(<App />);
}
// 旧代码由 js/main.js 继续驱动，两者并存
```

**验证**：运行 `npm run dev`，旧功能完全正常，React DevTools 能检测到根节点。

---

### 阶段二：全局状态迁移（3–5 天）

**目标**：将散落在 `window.*` 上的约 30 个全局状态迁移到 Zustand store，作为新旧代码的"共享数据层"。

#### 2.1 识别核心全局状态

从 `js/main.js` 提取的关键全局变量：

```
window.currentUser        window.files
window.currentFileId      window.vditor
window.nightMode          window.vditorReady
window.unsavedChanges     window.userSettings
window.pendingServerSync  window.isFileSwitchLoading
...（共约 30 个）
```

#### 2.2 创建 Zustand Store

```
src/store/
├── useAppStore.ts      # 核心应用状态（user、files、currentFileId）
├── useEditorStore.ts   # 编辑器状态（vditor 实例、vditorReady）
├── useUIStore.ts       # UI 状态（nightMode、sidebarOpen、loadingState）
└── index.ts            # 统一导出
```

```ts
// src/store/useAppStore.ts
import { create } from 'zustand';

interface AppState {
  currentUser: User | null;
  files: FileRecord[];
  currentFileId: string | null;
  unsavedChanges: Record<string, boolean>;
  setCurrentUser: (user: User | null) => void;
  setFiles: (files: FileRecord[]) => void;
  // ...
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: JSON.parse(localStorage.getItem('vditor_user') || 'null'),
  files: JSON.parse(localStorage.getItem('vditor_files') || '[]'),
  currentFileId: null,
  unsavedChanges: {},
  setCurrentUser: (user) => set({ currentUser: user }),
  // ...
}));
```

#### 2.3 建立双向同步桥（关键！）

旧代码大量读写 `window.*`，迁移期间需要**双向同步**，避免新旧状态撕裂：

```ts
// src/legacy/globalBridge.ts
// 将 Zustand store 的变化同步回 window.*（兼容旧代码读取）
// 将 window.* 的变化同步到 Zustand store（新 React 组件可感知）

import { useAppStore } from '../store';

export function initGlobalBridge() {
  // Zustand → window（旧代码只读）
  useAppStore.subscribe((state) => {
    window.currentUser = state.currentUser;
    window.files = state.files;
    window.currentFileId = state.currentFileId;
  });

  // window → Zustand（旧代码写入时通知 React）
  // 通过 Proxy 拦截 window.files 等赋值操作
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'files');
  Object.defineProperty(window, 'files', {
    set(value) {
      if (value === useAppStore.getState().files) return; // 2.4 防环保护
      originalDescriptor?.set?.call(window, value);
      useAppStore.getState().setFiles(value);
    },
    get() { return originalDescriptor?.get?.call(window); },
    configurable: true
  });
}

#### 2.4 防死循环逻辑（关键）

在双向绑定中，必须确保：
1. **值比较**：在 setter 中先判断 `newValue === oldValue`，若无变化则直接 return。
2. **Flag 锁**：对于复杂对象，使用一个全局 `isSyncing` 标志位防止同步操作相互触发。
```

> [!WARNING]
> `window.vditor` 实例不应放入 Zustand（不可序列化）。使用 `useRef` 在 React 侧持有引用，仅在 store 中保存 `vditorReady: boolean` 状态。

---

### 阶段三：UI 组件化（1–3 周）

**目标**：将 `js/ui/` 中的模块逐一替换为 React 组件，按优先级排序。

#### 3.1 组件迁移优先级

| 优先级 | 模块 | 对应旧文件 | 说明 |
|--------|------|------------|------|
| P0 | `<VditorWrapper />` | Vditor 初始化（`main.js`）| 核心编辑器桥接 |
| P0 | `<FileList />` | `js/ui/file-manager.js` | 侧边栏文件树 |
| P1 | `<Toolbar />` | `main.js` toolbar 部分 | 顶部工具栏 |
| P1 | `<AIAssistant />` | `js/ui/ai-assistant.js` | AI 侧边板 |
| P1 | `<DialogManager />` | `js/ui/dialog.js` | 全局对话框 |
| P2 | `<ExportPanel />` | `js/ui/export.js` | 导出面板 |
| P2 | `<SharePanel />` | `js/ui/share.js` | 分享面板 |
| P3 | `<InsertPicker />` | `js/ui/insert-picker.js` | 插入选择器 |
| P3 | `<ChartEditor />` | `js/ui/chart.js` | 图表编辑 |

#### 3.2 Vditor 桥接（最关键组件）

Vditor 是非 React 库，使用 `useRef` + `useEffect` 模式封装，并加入 Strict Mode 保护：

```tsx
// src/components/editor/VditorWrapper.tsx
import { useRef, useEffect } from 'react';
import Vditor from 'vditor';
import { useEditorStore } from '../../store/useEditorStore';

export function VditorWrapper({ fileContent }: { fileContent: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vditorRef = useRef<Vditor | null>(null);
  const isInitializing = useRef(false); // 防止 React Strict Mode 双重初始化
  const { setVditorReady } = useEditorStore();

  useEffect(() => {
    if (!containerRef.current || vditorRef.current || isInitializing.current) return;

    isInitializing.current = true;
    vditorRef.current = new Vditor(containerRef.current, {
      after() {
        setVditorReady(true);
        window.vditor = vditorRef.current;
        window.vditorReady = true;
        isInitializing.current = false;
      },
      ...window._legacyEditorConfig,
    });

    return () => {
      vditorRef.current?.destroy();
      vditorRef.current = null;
      window.vditor = null;
      window.vditorReady = false;
      setVditorReady(false);
      isInitializing.current = false;
    };
  }, []);

  return <div ref={containerRef} id="vditor" />;
}
```

#### 3.3 遗留模块直接引入模式

对于尚未 React 化的 `js/ui/` 模块（如 `chart.js`、`ppt-generator.js`），无需重写，通过**直接 import 调用**：

```tsx
// src/components/export/ExportButton.tsx
import { useState } from 'react';

export function ExportButton() {
  const handlePdfExport = async () => {
    // 直接调用遗留模块的导出函数
    const { generatePDF } = await import('../../js/ui/pdf-generator.js');
    await generatePDF(window.vditor?.getValue() || '');
  };

  return <button onClick={handlePdfExport}>导出 PDF</button>;
}
```

#### 3.4 WebAssembly 模块封装为 Hook

```tsx
// src/hooks/useWasmTextEngine.ts
import { useState, useEffect } from 'react';

export function useWasmTextEngine() {
  const [ready, setReady] = useState(false);
  const [engine, setEngine] = useState<any>(null);

  useEffect(() => {
    // 复用现有 gateway，无需修改 WASM 代码
    if (window.wasmTextEngineGateway) {
      window.wasmTextEngineGateway.ensureReady()
        .then(() => {
          setEngine(window.wasmTextEngineGateway);
          setReady(true);
        });
    }
  }, []);

  return { ready, engine };
}
```

#### 3.5 Tauri Bridge 封装为 Hook

```tsx
// src/hooks/useTauriRuntime.ts
export function useTauriRuntime() {
  const isTauri = !!(window.__TAURI__ || window.desktopRuntime?.type === 'tauri');
  
  const openFile = async (path: string) => {
    // 直接复用 js/tauri-bridge.js 的函数
    return window.tauriBridge?.openFile(path);
  };

  return { isTauri, openFile };
}
```

#### 3.6 目录重组方案

迁移完成后的目标结构：

```
src/
├── main.tsx
├── App.tsx
├── components/
│   ├── editor/
│   │   ├── VditorWrapper.tsx       # 编辑器桥接
│   │   └── LongFileEditor.tsx      # 超长文件模式
│   ├── sidebar/
│   │   ├── FileList.tsx
│   │   └── FileTree.tsx
│   ├── toolbar/
│   │   ├── Toolbar.tsx
│   │   └── ToolbarButton.tsx
│   ├── ai/
│   │   ├── AIAssistant.tsx
│   │   └── AIChat.tsx
│   ├── export/
│   │   └── ExportPanel.tsx
│   ├── share/
│   │   └── SharePanel.tsx
│   └── ui/
│       ├── Dialog.tsx
│       ├── Modal.tsx
│       └── Toast.tsx
├── hooks/
│   ├── useWasmTextEngine.ts
│   ├── useTauriRuntime.ts
│   ├── useAutoSave.ts
│   ├── useFileSync.ts
│   └── useI18n.ts
├── store/
│   ├── useAppStore.ts
│   ├── useEditorStore.ts
│   └── useUIStore.ts
└── legacy/
    └── globalBridge.ts             # window.* 双向同步

js/                    # 原有代码，渐进式清空
├── files/             # 保留核心逻辑，React 调用
├── ui/                # 逐步由 src/components/ 替代
└── ...

api/                   # 完全不动
css/styles.css         # 渐进式拆分为 src/components/**/*.css
```

---

### 阶段四：路由与页面级重构（3–5 天）

**目标**：引入 React Router，替换现有基于 URL 参数的页面切换。

#### 4.1 安装 React Router

```bash
npm install react-router-dom
```

#### 4.2 路由设计

```tsx
// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<EditorLayout />} />
        <Route path="/share/:shareId" element={<ShareRuntime />} />
        <Route path="/print" element={<PrintPreview />} />
      </Routes>
    </BrowserRouter>
  );
}
```

> [!NOTE]
> `js/page/share-runtime.js`（100KB）是独立的分享页运行时，可作为最后一个迁移的页面，阶段四前直接复用。

---

## TypeScript 引入时机

| 时机 | 策略 |
|------|------|
| **现在（阶段一）** | `tsconfig.json` 已存在，新建的 `src/` 下所有文件均为 `.tsx`/`.ts` |
| **阶段二** | 为 Zustand store 添加完整类型定义（从 `js/files/types.ts` 复用） |
| **阶段三** | 组件 Props 类型强制，复用 `js/files/types.ts` 中已有的类型 |
| **阶段四结束后** | 对 `js/files/runtime-core.ts` 移除 `// @ts-nocheck`，逐函数修复类型 |
| **不急着做** | `js/ui/*.js` 只需在 React 化时顺手加类型，无需提前转换 |

---

## 可读性提升措施

### 组件拆分原则
- **单一职责**：每个组件只管理一个 UI 关注点，最大 200 行
- **逻辑与视图分离**：业务逻辑提取为自定义 Hook，组件只做渲染
- **遗留函数保留原地**：`js/ui/` 中的工具函数不搬移，组件内直接 import

### CSS 模块化策略
- 新组件使用 `ComponentName.module.css`（CSS Modules）
- 旧 `css/styles.css` 只负责全局变量和基础重置，不删除
- 组件特定样式逐步从 `styles.css` 剪切到对应 `*.module.css`

---

## 风险提示与回滚预案

> [!CAUTION]
> **最高风险**：`runtime-core.ts`（6,565 行）大量使用 `global[name]` 模式读写全局变量。在 Zustand store 和 `window.*` 完成双向同步之前，**不要**删除任何 `window.*` 赋值。

| 风险 | 概率 | 应对 |
|------|------|------|
| Vditor 初始化时序问题 | 中 | 用 `vditorInitPromise` 保护，React 中用 `useEffect` 异步等待 |
| WASM 模块在 React 严格模式下双重 init | 低 | `useEffect` 依赖数组加 `[]`，`useRef` 保护 init 状态 |
| `window.*` 双向同步导致无限循环 | 中 | Proxy setter 中加值比较保护（Phase 2.4） |
| UI 层级 (Z-Index) 冲突 | 高 | 确保 React Root 容器与旧 #app 平级，或逐步隐藏旧容器 |
| jQuery 与 React 事件冒泡冲突 | 低 | 避免将 React 组件嵌套在依赖 jQuery 事件监听的旧 DOM 中 |
| 旧 jQuery 代码与 React 事件系统冲突 | 低 | jQuery 仅用于少数模块，React 组件中彻底不用 jQuery |
| Tauri 构建失败 | 低 | `src-tauri/` 完全不动，构建脚本不变 |

### 回滚预案

每个阶段完成后打一个 git tag：

```bash
git tag -a react-phase-1 -m "React 基础设施就绪"
git tag -a react-phase-2 -m "Zustand store 迁移完成"
git tag -a react-phase-3 -m "核心组件 React 化完成"
```

若某阶段出现严重回归，直接 `git checkout react-phase-N-1` 即可恢复上一阶段可运行状态。由于旧代码从未删除，回滚成本极低。

---

## 验证计划

- **每阶段末**：运行 `npm run dev`，验证编辑器、文件操作、AI 助手、分享功能均正常
- **阶段三末**：运行 `npm test`（现有 Jest 测试套件）
- **阶段四末**：运行 `npm run build:web` 确认生产构建无报错，WASM 文件正确复制到 `dist/`
