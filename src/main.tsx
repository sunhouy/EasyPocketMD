import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initGlobalBridge } from './legacy/globalBridge';

initGlobalBridge();

const root = document.getElementById('react-root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}