import { type Clock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import {
  optionalNonNegativeNumber,
  optionalPositiveInt,
  optionalText,
  requireNonNegativeInt,
  requireOneOf,
  requireText,
} from '../shared/validation';

/**
 * The kinds of file Workbench stores. Covers everything from images through
 * to build artifacts; a new tool reuses one of these rather than inventing
 * its own storage concept.
 */
export const ASSET_KINDS = [
  'image',
  'video',
  'audio',
  'model_3d',
  'reference',
  'export',
  'build_artifact',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/**
 * `source` is the file as uploaded. `thumbnail` and `preview` are generated
 * from a source asset and carry `sourceAssetId`, so a derivative is never
 * mistaken for independent content.
 */
export const ASSET_VARIANTS = ['source', 'thumbnail', 'preview'] as const;
export type AssetVariant = (typeof ASSET_VARIANTS)[number];

export const ASSET_STATUSES = ['active', 'archived'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const MAX_ASSET_FILENAME_LENGTH = 300;
export const MAX_ASSET_MIME_TYPE_LENGTH = 150;
export const MAX_ASSET_STORAGE_KEY_LENGTH = 1024;
export const MAX_ASSET_CHECKSUM_LENGTH = 128;
export const MAX_ASSET_CREATED_BY_LENGTH = 200;

/**
 * Ceiling on an uploaded file's raw size (issue #174), shared by the upload
 * form (`apps/web`) and `AssetService.upload` so both sides refuse the same
 * file for the same stated reason. The base64 JSON contract
 * (`CreateAssetDto`) costs about a third more in transfer, so
 * `apps/api/src/main.ts`'s body limit is set well above this, not equal to
 * it.
 */
export const MAX_ASSET_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * A reusable, project-scoped file: an image, a video, an audio clip, a 3D
 * file, a reference, an export, or a build artifact.
 *
 * An asset is not an entity and carries no feature-specific foreign keys. A
 * tool that wants to show one links to it through an `asset_reference` entity
 * and the relationship graph (see `asset-reference.ts`), so the same asset can
 * appear in Character Studio, Moodboard and the GDD without being copied.
 */
export interface Asset {
  id: string;
  projectId: string;
  kind: AssetKind;
  filename: string;
  mimeType: string;
  byteSize: number;
  /** Key on the configured `ObjectStorageProvider`. Never a provider URL. */
  storageKey: string;
  checksum: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  variant: AssetVariant;
  /** The asset this one was derived from. Null unless `variant` is a derivative. */
  sourceAssetId: string | null;
  status: AssetStatus;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  /** Free text until authentication lands; then a user id. */
  createdBy: string | null;
}

export interface CreateAssetInput {
  projectId: string;
  kind: AssetKind;
  filename: string;
  mimeType: string;
  byteSize: number;
  storageKey: string;
  checksum: string;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  variant?: AssetVariant;
  sourceAssetId?: string | null;
  createdBy?: string | null;
}

export interface AssetFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createAsset(input: CreateAssetInput, deps: AssetFactoryDeps): Asset {
  const now = deps.clock.now();
  const variant = requireOneOf('variant', input.variant ?? 'source', ASSET_VARIANTS);
  const sourceAssetId = optionalText('sourceAssetId', input.sourceAssetId, 200);

  if (variant === 'source' && sourceAssetId !== null) {
    throw new ValidationError('A source asset cannot declare its own sourceAssetId', {
      field: 'sourceAssetId',
    });
  }
  if (variant !== 'source' && sourceAssetId === null) {
    throw new ValidationError(`A "${variant}" asset must declare the asset it derives from`, {
      field: 'sourceAssetId',
    });
  }

  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    kind: requireOneOf('kind', input.kind, ASSET_KINDS),
    filename: requireText('filename', input.filename, MAX_ASSET_FILENAME_LENGTH),
    mimeType: requireText('mimeType', input.mimeType, MAX_ASSET_MIME_TYPE_LENGTH),
    byteSize: requireNonNegativeInt('byteSize', input.byteSize),
    storageKey: requireText('storageKey', input.storageKey, MAX_ASSET_STORAGE_KEY_LENGTH),
    checksum: requireText('checksum', input.checksum, MAX_ASSET_CHECKSUM_LENGTH),
    width: optionalPositiveInt('width', input.width),
    height: optionalPositiveInt('height', input.height),
    durationSeconds: optionalNonNegativeNumber('durationSeconds', input.durationSeconds),
    variant,
    sourceAssetId,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    createdBy: optionalText('createdBy', input.createdBy, MAX_ASSET_CREATED_BY_LENGTH),
  };
}

/**
 * Archiving hides an asset from normal listings without deleting its bytes,
 * so an `asset_reference` entity that points at it does not go dangling.
 */
export function archiveAsset(asset: Asset, deps: { clock: Clock }): Asset {
  if (asset.status === 'archived') {
    throw new ValidationError('Asset is already archived', { assetId: asset.id });
  }

  const now = deps.clock.now();
  return { ...asset, status: 'archived', archivedAt: now, updatedAt: now };
}

export function restoreAsset(asset: Asset, deps: { clock: Clock }): Asset {
  if (asset.status !== 'archived') {
    throw new ValidationError('Asset is not archived', { assetId: asset.id });
  }

  return { ...asset, status: 'active', archivedAt: null, updatedAt: deps.clock.now() };
}
