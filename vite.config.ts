import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages base URL - ajusta 'PanelWeb' al nombre de tu repositorio
  base: '/PanelWeb/',
  server: {
    port: 5174,
    open: false,
  },
});