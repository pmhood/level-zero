import { MAX_ASSET_UPLOAD_BYTES } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import { checkFile, checkUploadSize, deriveAssetKind } from './asset-upload';

function file(name: string, type: string, size = 1024): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe('deriveAssetKind', () => {
  it.each([
    ['image/png', 'image'],
    ['image/svg+xml', 'image'],
    ['video/mp4', 'video'],
    ['audio/mpeg', 'audio'],
    ['model/gltf-binary', 'model_3d'],
  ] as const)('maps %s to %s', (mimeType, kind) => {
    const result = deriveAssetKind(file('thing', mimeType));
    expect(result).toEqual({ kind });
  });

  it('falls back to a known 3D extension when the browser gives no useful MIME type', () => {
    const result = deriveAssetKind(file('statue.fbx', ''));
    expect(result).toEqual({ kind: 'model_3d' });
  });

  it('rejects an unsupported type with a human-readable reason', () => {
    const result = deriveAssetKind(file('notes.pdf', 'application/pdf'));
    expect(result).toMatchObject({ reason: expect.stringContaining('application/pdf') });
  });

  it('rejects a file with no usable type or extension', () => {
    const result = deriveAssetKind(file('mystery', ''));
    expect(result).toMatchObject({ reason: expect.stringContaining('mystery') });
  });
});

describe('checkUploadSize', () => {
  it('accepts a file at or under the stated limit', () => {
    expect(checkUploadSize(file('a.png', 'image/png', MAX_ASSET_UPLOAD_BYTES))).toBeNull();
  });

  it('rejects a file over the stated limit, naming both sizes', () => {
    const result = checkUploadSize(file('big.png', 'image/png', MAX_ASSET_UPLOAD_BYTES + 1));
    expect(result?.reason).toContain('big.png');
    expect(result?.reason).toContain('50.0 MB');
  });
});

describe('checkFile', () => {
  it('reports the type rejection before ever checking size', () => {
    const result = checkFile(file('notes.pdf', 'application/pdf', MAX_ASSET_UPLOAD_BYTES + 1));
    expect(result).toMatchObject({ reason: expect.stringContaining('application/pdf') });
  });

  it('reports the size rejection for an otherwise-supported type', () => {
    const result = checkFile(file('big.png', 'image/png', MAX_ASSET_UPLOAD_BYTES + 1));
    expect(result).toMatchObject({ reason: expect.stringContaining('upload limit') });
  });

  it('accepts a supported, under-limit file', () => {
    expect(checkFile(file('kael.png', 'image/png'))).toEqual({ kind: 'image' });
  });
});
