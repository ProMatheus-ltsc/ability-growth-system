import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    // 本地联调：另开终端 npm run pages:dev（wrangler pages dev 默认 8788）
    proxy: {
      '/api': 'http://127.0.0.1:8788',
    },
  },
});
