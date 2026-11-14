import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const pkg = (name: string) =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url));

// The workspace packages are pure TypeScript; the browser bundles their sources directly,
// so `npm run dev` needs no prior build of packages/*.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@spm/shared': pkg('shared'),
      '@spm/scheduler': pkg('scheduler'),
      '@spm/exporters': pkg('exporters'),
    },
  },
  server: { port: 5173, strictPort: false },
  build: { chunkSizeWarningLimit: 900 },
});
