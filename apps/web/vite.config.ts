import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // The deployed dev site, from the untracked .env.local; local dev uses its API and Cognito config.
  const proxyTarget = loadEnv(mode, process.cwd(), '').VITE_API_PROXY_TARGET;
  const proxy = proxyTarget
    ? {
        '/api': { target: proxyTarget, changeOrigin: true },
        '/config.json': { target: proxyTarget, changeOrigin: true },
      }
    : undefined;

  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173, strictPort: true, proxy },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test-setup.ts'],
    },
  };
});
