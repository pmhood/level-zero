import { loadDotEnv } from '@level-zero/config';
import type { NextConfig } from 'next';

// The monorepo keeps one `.env` at the repository root; Next only looks inside
// the app directory, so load it here before the config is evaluated.
loadDotEnv(__dirname);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Shared UI is published as source and compiled by the consuming app.
  transpilePackages: ['@level-zero/ui'],
  typedRoutes: true,
};

export default nextConfig;
