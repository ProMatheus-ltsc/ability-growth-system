import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared/core': path.resolve(__dirname, '../shared-core/src'),
    },
    // 强制 React 系列解析到项目根 node_modules 的单实例：
    // @shared/core 源码位于项目父目录，其自身 node_modules 里有 npm 自动安装的独立 react 副本，
    // 不 dedupe 会导致 production bundle 出现两份 React，hooks dispatcher(h.H) 为 null 而白屏
    // （dev 因依赖预打包不受影响，typecheck/build 也不报错）。
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom', 'react-hook-form'],
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
});
