import { NotFoundError, ValidationError } from '@level-zero/domain';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalObjectStorageProvider } from './local-object-storage';

let rootDir: string;
let storage: LocalObjectStorageProvider;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), 'level-zero-storage-'));
  storage = new LocalObjectStorageProvider({ rootDir });
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

describe('put / get', () => {
  it('genuinely writes and reads bytes back', async () => {
    await storage.put({
      key: 'project-1/asset-1/kael.png',
      body: Buffer.from('pretend png bytes'),
      contentType: 'image/png',
    });

    await expect(storage.get('project-1/asset-1/kael.png')).resolves.toEqual(
      Buffer.from('pretend png bytes'),
    );
    // Proves the bytes really landed on disk, not just in an in-memory cache.
    const onDisk = await readFile(join(rootDir, 'project-1/asset-1/kael.png'));
    expect(onDisk).toEqual(Buffer.from('pretend png bytes'));
  });

  it('creates intermediate directories as needed', async () => {
    await storage.put({
      key: 'a/b/c/deep.bin',
      body: Buffer.from([1, 2, 3]),
      contentType: 'application/octet-stream',
    });

    await expect(storage.get('a/b/c/deep.bin')).resolves.toEqual(Buffer.from([1, 2, 3]));
  });

  it('reports a missing key as not found', async () => {
    await expect(storage.get('never-uploaded')).rejects.toThrow(NotFoundError);
  });
});

describe('delete', () => {
  it('removes a stored object', async () => {
    await storage.put({
      key: 'to-delete.bin',
      body: Buffer.from('gone soon'),
      contentType: 'application/octet-stream',
    });

    await storage.delete('to-delete.bin');

    await expect(storage.get('to-delete.bin')).rejects.toThrow(NotFoundError);
  });

  it('does not throw when the key never existed', async () => {
    await expect(storage.delete('never-there.bin')).resolves.toBeUndefined();
  });
});

describe('getUrl', () => {
  it('returns a file url when no base url is configured', async () => {
    await storage.put({
      key: 'kael.png',
      body: Buffer.from('x'),
      contentType: 'image/png',
    });

    await expect(storage.getUrl('kael.png')).resolves.toBe(`file://${join(rootDir, 'kael.png')}`);
  });

  it('builds a url under the configured base', async () => {
    const withBase = new LocalObjectStorageProvider({
      rootDir,
      baseUrl: 'http://localhost:3001/assets/',
    });

    await expect(withBase.getUrl('project-1/kael portrait.png')).resolves.toBe(
      'http://localhost:3001/assets/project-1/kael%20portrait.png',
    );
  });
});

describe('key safety', () => {
  it('refuses a key that would escape the storage root', async () => {
    await expect(
      storage.put({
        key: '../outside.bin',
        body: Buffer.from('x'),
        contentType: 'application/octet-stream',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses an absolute-path key', async () => {
    await expect(storage.get('/etc/passwd')).rejects.toThrow(ValidationError);
  });

  it('refuses a blank key', async () => {
    await expect(storage.get('   ')).rejects.toThrow(ValidationError);
  });
});
