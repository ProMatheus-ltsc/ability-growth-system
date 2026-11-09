import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared/core': path.resolve(import.meta.dirname, '../shared-core/src'),
    },
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom', 'react-hook-form'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
