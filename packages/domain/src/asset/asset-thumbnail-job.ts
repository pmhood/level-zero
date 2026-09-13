/**
 * The steps a thumbnail job reports, in order, as a UI shows them.
 *
 * Both processes read this: `AssetService` sizes the job record from its
 * length when the work is queued, and `apps/worker` names each step as it
 * reaches it — the same convention `SEARCH_INDEX_JOB_STEPS` and
 * `GENERATION_JOB_STEPS` follow.
 */
export const ASSET_THUMBNAIL_JOB_STEPS = ['Loading source', 'Generating derivatives'] as const;

/**
 * Longest edge, in pixels, a generated thumbnail is scaled to fit inside.
 * Never enlarged past the source's own size.
 */
export const THUMBNAIL_MAX_DIMENSION = 320;

/**
 * Longest edge, in pixels, a generated preview is scaled to fit inside.
 *
 * Only produced when the source is larger than `THUMBNAIL_MAX_DIMENSION` —
 * anything already that small has no more detail for a preview to keep that
 * the thumbnail does not already show.
 */
export const PREVIEW_MAX_DIMENSION = 1600;
