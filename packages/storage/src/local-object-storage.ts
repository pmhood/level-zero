import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

import {
  NotFoundError,
  ValidationError,
  type GetUrlOptions,
  type ObjectStorageProvider,
  type PutObjectInput,
} from '@level-zero/domain';

export interface LocalObjectStorageOptions {
  /** Directory bytes are written under. Created on first use if missing. */
  rootDir: string;
  /**
   * Base URL used to build a "safe" URL for a key, e.g.
   * `http://localhost:3001/assets`. Omit to get a `file://` URL instead, which
   * is only ever meaningful on the machine running the process.
   */
  baseUrl?: string;
}

/**
 * Filesystem-backed `ObjectStorageProvider` for local development.
 *
 * Genuinely writes and reads bytes under `rootDir`, so it is a real provider
 * rather than a stub: swapping it for an S3/R2 provider in production is a
 * matter of registering a different `ObjectStorageProvider`, not changing
 * `AssetService` or the `Asset` model.
 */
export class LocalObjectStorageProvider implements ObjectStorageProvider {
  readonly id = 'local';

  private readonly rootDir: string;
  private readonly baseUrl: string | null;

  constructor(options: LocalObjectStorageOptions) {
    this.rootDir = resolve(options.rootDir);
    this.baseUrl = options.baseUrl ? options.baseUrl.replace(/\/+$/, '') : null;
  }

  async put(input: PutObjectInput): Promise<void> {
    const path = this.resolveKey(input.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.body);
  }

  async get(key: string): Promise<Buffer> {
    const path = this.resolveKey(key);
    try {
      return await readFile(path);
    } catch (error) {
      if (isNotFound(error)) throw new NotFoundError('Object', key);
      throw error;
    }
  }

  /** Local dev has no expiry concept, so `options` (part of the provider shape) is unused. */
  async getUrl(key: string, _options?: GetUrlOptions): Promise<string> {
    const path = this.resolveKey(key);
    return this.baseUrl ? `${this.baseUrl}/${encodeKeyForUrl(key)}` : `file://${path}`;
  }

  async delete(key: string): Promise<void> {
    const path = this.resolveKey(key);
    await rm(path, { force: true });
  }

  /** Resolves `key` to a path under the root, refusing anything that would escape it. */
  private resolveKey(key: string): string {
    if (!key || key.trim().length === 0) {
      throw new ValidationError('Object storage key must not be empty', { field: 'key' });
    }

    const resolved = resolve(this.rootDir, key);
    const fromRoot = relative(this.rootDir, resolved);
    if (fromRoot.startsWith('..') || resolve(this.rootDir, fromRoot) !== resolved) {
      throw new ValidationError('Object storage key must stay within the storage root', {
        field: 'key',
        key,
      });
    }
    return resolved;
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function encodeKeyForUrl(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}
