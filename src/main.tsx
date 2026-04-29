import { createRoot } from 'react-dom/client';
import App from './App';
import { initGlobalBridge } from './legacy/globalBridge';

initGlobalBridge();

const root = document.getElementById('react-root');
if (root) {
  // Vditor 非 React 子树，挂载在 <Editor> 的 #vditor 上；不使用 StrictMode（开发环境双挂载会拆掉挂载点）
  createRoot(root).render(<App />);
}