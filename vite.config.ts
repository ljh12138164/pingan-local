import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: '127.0.0.1', port: 47820, strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/work/**', '**/.impeccable/**'] },
    proxy: { '/api': { target: 'http://127.0.0.1:47821' } },
  },
});
