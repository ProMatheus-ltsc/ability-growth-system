import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@shared/core';
import { AuthProvider } from './hooks/useAuth';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { App } from './App';
import './styles/index.css';
import '@shared/core/styles/responsive.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root 节点缺失');

/**
 * 错误边界要放在 Router 里面才能拿到当前路由：
 * 用户点导航换页时 `resetKey` 变化 → 自动清掉上一页的错误，
 * 否则一次崩溃会把整个应用永久锁在错误页上。
 */
function BoundaryWithRoute() {
  const location = useLocation();
  return (
    <AppErrorBoundary resetKey={`${location.pathname}${location.search}`}>
      <App />
    </AppErrorBoundary>
  );
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <BoundaryWithRoute />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
