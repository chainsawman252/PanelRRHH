import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages base URL
  base: '/PanelRRHH/',
  server: {
    port: 5174,
    open: false,
  },
});