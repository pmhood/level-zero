import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

/**
 * Walks up from `startDir` looking for an env file and loads it into
 * `process.env` using Node's built-in loader.
 *
 * The monorepo keeps a single `.env` at the repository root so the API, the
 * worker and the web app all read the same values. Missing files are not an
 * error: in CI and in production the environment is provided by the platform.
 *
 * @returns the absolute path of the file that was loaded, or `null`.
 */
export function loadDotEnv(startDir: string = process.cwd(), fileName = '.env'): string | null {
  const { root } = parse(startDir);
  let current = startDir;

  for (;;) {
    const candidate = join(current, fileName);
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }
    if (current === root) return null;
    current = dirname(current);
  }
}
