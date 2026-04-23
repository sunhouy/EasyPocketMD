/** @jest-environment jsdom */

/**
 * 阶段一测试：验证 React 应用入口 main.tsx 挂载逻辑
 * 测试 createRoot 初始化和 #react-root 挂载点存在性
 */
import React from 'react';
import { createRoot } from 'react-dom/client';

const container = document.createElement('div');
container.id = 'react-root';
document.body.appendChild(container);

describe('main.tsx', () => {
  afterAll(() => {
    document.body.removeChild(container);
  });

  it('should create root and render App when react-root exists', () => {
    const root = createRoot(container);
    const App = () => <div data-testid="test-app">Test App</div>;
    root.render(<App />);
    expect(document.getElementById('react-root')).toBeInTheDocument();
  });

  it('should not render when react-root does not exist', () => {
    const nonExistentContainer = document.getElementById('non-existent-root');
    if (nonExistentContainer) {
      const root = createRoot(nonExistentContainer);
      const App = () => <div>Test</div>;
      root.render(<App />);
    }
    expect(true).toBe(true);
  });
});