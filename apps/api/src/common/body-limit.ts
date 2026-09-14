import { MAX_ASSET_UPLOAD_BYTES } from '@level-zero/domain';

/**
 * The JSON body limit the API's Express adapter enforces (#174).
 *
 * Nest's default body parser caps a JSON body at Express's 100kb default,
 * which rejected any real file upload with a 413 before it reached
 * `AssetsController`, since `CreateAssetDto` carries the file as base64 in
 * the JSON body rather than a multipart part. Base64 costs about a third
 * more in transfer than the raw file, plus room for the rest of the payload
 * (filename, mimeType, ...), so this is set well above
 * `MAX_ASSET_UPLOAD_BYTES` rather than at it. Shared by `main.ts`'s bootstrap
 * and the controller test so the two never drift apart.
 */
export const MAX_JSON_BODY_BYTES = Math.ceil(MAX_ASSET_UPLOAD_BYTES * 1.5);
