import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = document.getElementById('react-root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}