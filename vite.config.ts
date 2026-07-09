import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        pet: 'src/pet-window/index.html',
        utility: 'src/utility-window/index.html',
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**', '**/.git/**', '**/.git/**'],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
