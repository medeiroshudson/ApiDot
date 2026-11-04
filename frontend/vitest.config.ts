import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

function svgPlugin() {
  const loader = require('./loaders/svg-react-loader.cjs');
  return {
    name: 'svg-loader-plugin',
    transform(code: string, id: string) {
      if (id.endsWith('.svg')) {
        const mockContext = { cacheable: () => {} };
        const res = loader.call(mockContext, code);
        return { code: res, map: null };
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), svgPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: [...configDefaults.exclude, 'playwright/**', '**/playwright/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@assets': path.resolve(__dirname, './assets'),
    },
  },
});
