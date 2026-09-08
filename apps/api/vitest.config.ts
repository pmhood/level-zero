import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // NestJS relies on `emitDecoratorMetadata`, which esbuild cannot produce, so
  // tests are transformed with SWC (see .swcrc).
  plugins: [swc.vite()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
