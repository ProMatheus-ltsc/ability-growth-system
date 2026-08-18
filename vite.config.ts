import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { superPlugins } from '@ali/aone-super-plugins';

export default defineConfig({
  plugins: [superPlugins({ framework: 'vite' }), react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
});
