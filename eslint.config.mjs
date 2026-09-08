import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      'packages/database/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': 'off',
    },
  },
  {
    // NestJS resolves constructor dependencies from `design:paramtypes`, which
    // TypeScript only emits for value imports. Rewriting an injected class to a
    // type-only import silently breaks DI at runtime, so the rule is off here.
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // The domain package must stay framework-free so it can be reused by the
    // API, the worker and the web app without dragging in runtime dependencies.
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@nestjs/*',
                'next',
                'next/*',
                'react',
                'react-dom',
                'drizzle-orm',
                'ioredis',
                'pg',
              ],
              message: 'packages/domain must not depend on frameworks or infrastructure libraries.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
