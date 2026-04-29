# Vditor 挂载到 React — 交接

## 方案

- **挂载点**：由 React 组件 `src/components/Editor/Editor.tsx` 渲染 `#vditor`（与原 `js/main.js` 中 `new Vditor('vditor', editorConfig)` 的 id 一致）。
- **初始化**：仍由遗留逻辑 `window.ensureVditorInitialized()` 完成，无需在 React 内复制 `editorConfig`。
- **实例同步**：`Editor` 内 `useEffect` 调用幂等的 `ensureVditorInitialized()`，`then` 中将实例写入 `useEditorStore.setVditorInstance`。
- **StrictMode**：入口 `src/main.tsx` 去掉 `StrictMode`，避免开发环境双挂载拆掉 `#vditor` DOM，导致 Vditor 绑定到已卸载节点。

## 布局

- `index.html` 移除与 `#react-root` 并列的裸 `#vditor`，避免重复 id。
- `css/styles.css` 增加 `#react-root { width/height: 100% }`，保证子树内百分比高度有效。

## 注意事项

- 若将来恢复 `StrictMode`，需保证 Vditor 挂载节点在 dev 下不被卸载，或改为由 React 完全托管 `destroy`/`new` 生命周期。
