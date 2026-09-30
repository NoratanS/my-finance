import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // A reserved name (RFC 6761) instead of jsdom's default http://localhost:3000, which is
    // where the shipped app is published: a unit-test request can never reach a running
    // instance. See src/test/server.ts.
    environmentOptions: { jsdom: { url: 'http://my-finance.invalid' } },
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
