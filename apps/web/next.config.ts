import { join } from 'node:path';

import { loadDotEnv } from '@level-zero/config';
import type { NextConfig } from 'next';

// The monorepo keeps one `.env` at the repository root; Next only looks inside
// the app directory, so load it here before the config is evaluated.
loadDotEnv(__dirname);

// Set by docker/Dockerfile.web, and only there. `output: 'standalone'` emits a
// self-contained server plus a traced node_modules, which is what the container
// image ships — but it also changes what `next build` leaves on disk, so it is
// opt-in rather than the default that `pnpm dev` and `pnpm start` inherit.
const standalone = process.env.NEXT_OUTPUT === 'standalone';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Shared UI is published as source and compiled by the consuming app.
  transpilePackages: ['@level-zero/ui'],
  typedRoutes: true,
  ...(standalone
    ? {
        output: 'standalone' as const,
        // Without this the trace is rooted at apps/web and stops at the
        // workspace symlinks, so @level-zero/* and everything under the root
        // node_modules is left out of the image and the server dies on its
        // first import.
        outputFileTracingRoot: join(__dirname, '..', '..'),
      }
    : {}),
};

export default nextConfig;
