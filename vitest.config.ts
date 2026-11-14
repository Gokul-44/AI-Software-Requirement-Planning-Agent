import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@spm/shared': src('./packages/shared/src/index.ts'),
      '@spm/scheduler': src('./packages/scheduler/src/index.ts'),
      '@spm/exporters': src('./packages/exporters/src/index.ts'),
    },
  },
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
    ],
    passWithNoTests: true,
    environment: 'node',
  },
});
