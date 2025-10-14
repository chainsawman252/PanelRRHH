import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/PanelRRHH/', // 👈 esto es necesario para GitHub Pages
  server: {
    port: 5174,
    open: false,
  },
});
