import { MAX_ASSET_UPLOAD_BYTES, type AssetKind } from '@level-zero/domain';

import { formatByteSize } from './asset-presentation';

/**
 * MIME types with no reliable prefix — glTF's binary form, mainly — plus the
 * file extensions browsers fall back to reporting an empty or generic
 * `type` for (`.fbx`, `.obj`, `.usdz`). `image/*`, `video/*` and `audio/*`
 * need no explicit list: any type in those families is accepted.
 */
const MODEL_3D_MIME_TYPES = new Set(['model/gltf-binary', 'model/gltf+json']);
const MODEL_3D_EXTENSIONS = new Set(['glb', 'gltf', 'fbx', 'obj', 'usdz']);

export interface DerivedAssetKind {
  kind: AssetKind;
}

export interface RejectedFile {
  reason: string;
}

function isDerivedAssetKind(result: DerivedAssetKind | RejectedFile): result is DerivedAssetKind {
  return 'kind' in result;
}

/**
 * The `AssetKind` an uploaded file becomes, from its MIME type (falling back
 * to its extension for the 3D formats browsers rarely give a useful MIME type
 * for). `reference`, `export` and `build_artifact` are never derived here —
 * imported files are always images, video, audio or a 3D model; anything
 * else is refused with a reason rather than guessed at (issue #174).
 */
export function deriveAssetKind(file: File): DerivedAssetKind | RejectedFile {
  const mimeType = file.type;

  if (mimeType.startsWith('image/')) return { kind: 'image' };
  if (mimeType.startsWith('video/')) return { kind: 'video' };
  if (mimeType.startsWith('audio/')) return { kind: 'audio' };
  if (mimeType.startsWith('model/') || MODEL_3D_MIME_TYPES.has(mimeType)) {
    return { kind: 'model_3d' };
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && MODEL_3D_EXTENSIONS.has(extension)) return { kind: 'model_3d' };

  return {
    reason: mimeType
      ? `"${mimeType}" isn't a supported file type. Upload an image, video, audio or 3D model file.`
      : `Level Zero couldn't tell what kind of file "${file.name}" is. Upload an image, video, audio or 3D model file.`,
  };
}

/** Enforces the same ceiling `AssetService.upload` does, so an over-limit file is refused with a clear message instead of a 413. */
export function checkUploadSize(file: File): RejectedFile | null {
  if (file.size <= MAX_ASSET_UPLOAD_BYTES) return null;
  return {
    reason: `"${file.name}" is ${formatByteSize(file.size)}, over the ${formatByteSize(MAX_ASSET_UPLOAD_BYTES)} upload limit.`,
  };
}

/** Rejects a file outright (wrong type or too large) before any of its bytes are read. */
export function checkFile(file: File): DerivedAssetKind | RejectedFile {
  const derived = deriveAssetKind(file);
  if (!isDerivedAssetKind(derived)) return derived;
  return checkUploadSize(file) ?? derived;
}

export interface FileMetadata {
  width?: number;
  height?: number;
  durationSeconds?: number;
}

/** Long enough for a large file to decode locally; short enough not to stall an upload on a file the browser can't introspect. */
const METADATA_TIMEOUT_MS = 8000;

/**
 * Reads what a source file's own bytes already say about it — image
 * dimensions, media duration — so `width`/`height`/`durationSeconds` are
 * populated on upload rather than left null (issue #174). Never rejects the
 * upload: a file the browser can't decode locally just uploads without this
 * metadata, the same as it would have before this issue.
 */
export async function readFileMetadata(file: File, kind: AssetKind): Promise<FileMetadata> {
  if (kind === 'image') return readImageMetadata(file);
  if (kind === 'video') return readMediaMetadata(file, 'video');
  if (kind === 'audio') return readMediaMetadata(file, 'audio');
  return {};
}

function readImageMetadata(file: File): Promise<FileMetadata> {
  return withObjectUrl(file, (url) => {
    return new Promise<FileMetadata>((resolve) => {
      const image = new Image();
      const finish = (metadata: FileMetadata) => {
        clearTimeout(timeout);
        resolve(metadata);
      };
      const timeout = setTimeout(() => finish({}), METADATA_TIMEOUT_MS);

      image.onload = () => finish({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => finish({});
      image.src = url;
    });
  });
}

function readMediaMetadata(file: File, kind: 'video' | 'audio'): Promise<FileMetadata> {
  return withObjectUrl(file, (url) => {
    return new Promise<FileMetadata>((resolve) => {
      const element = document.createElement(kind);
      const finish = (metadata: FileMetadata) => {
        clearTimeout(timeout);
        resolve(metadata);
      };
      const timeout = setTimeout(() => finish({}), METADATA_TIMEOUT_MS);

      element.preload = 'metadata';
      element.onloadedmetadata = () => {
        const durationSeconds = Number.isFinite(element.duration) ? element.duration : undefined;
        if (kind === 'audio') {
          finish({ durationSeconds });
          return;
        }
        const video = element as HTMLVideoElement;
        finish({
          width: video.videoWidth || undefined,
          height: video.videoHeight || undefined,
          durationSeconds,
        });
      };
      element.onerror = () => finish({});
      element.src = url;
    });
  });
}

async function withObjectUrl<T>(file: File, read: (url: string) => Promise<T>): Promise<T> {
  const url = URL.createObjectURL(file);
  try {
    return await read(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The file's bytes, base64-encoded for `CreateAssetDto`'s JSON contract. */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(',');
      resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read "${file.name}"`));
    reader.readAsDataURL(file);
  });
}
