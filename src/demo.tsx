import React from 'react';
import ReactDOM from 'react-dom/client';
import IconExample from './components/Icons/IconExample';

function App() {
  return (
    <div>
      <h1>SVGR Icons Demo</h1>
      <p>以下是使用 SVGR 作为 React 组件引入的 SVG 图标：</p>
      <IconExample size={32} color="#333" />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
