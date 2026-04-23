/** @jest-environment jsdom */

/**
 * 阶段一测试：验证 React 根组件 App 渲染正确
 * 门禁条件：npm run dev 正常；React DevTools 可检测到根节点；旧功能 100% 可用
 */
import { render } from '@testing-library/react';
import App from '../../../src/App';

describe('App', () => {
  it('should render react-root-container', () => {
    render(<App />);
    const container = document.getElementById('react-root-container');
    expect(container).toBeInTheDocument();
  });

  it('should have display contents style', () => {
    render(<App />);
    const container = document.getElementById('react-root-container');
    expect(container).toHaveStyle({ display: 'contents' });
  });
});