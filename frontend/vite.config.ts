import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        // The browser talks to one origin (this dev server), which is why the backend needs no
        // CORS configuration. Keep the Host header as the browser sent it.
        changeOrigin: false,
      },
    },
  },
});
