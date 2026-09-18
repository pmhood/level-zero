import type { AiCapability, ResolvedContext } from '@level-zero/ai';
import type {
  AnchoredReviewStatus,
  ApproveAssetResult,
  Asset,
  AssetKind,
  AssetLibraryPage,
  AssetMark,
  AssetMarkKind,
  AssetOrigin,
  AssetSelection,
  AssetSelectionContext,
  AssetSelectionState,
  AssetSelectionSummary,
  AssetSortDirection,
  AssetSortField,
  Comment,
  CommentThread,
  AssetPage,
  AssetStatus,
  CreateDocumentInput,
  CreateEntityInput,
  CreateProjectInput,
  Document,
  DocumentContent,
  DocumentHistory,
  DocumentVersion,
  DocumentVersionSnapshot,
  Entity,
  EntityHistory,
  EntityNeighborhood,
  EntityPage,
  EntityRelationship,
  EntityStatus,
  EntityType,
  EntityVersion,
  Finding,
  FindingPage,
  FindingStatus,
  Generation,
  GenerationPage,
  GenerationProvenance,
  GenerationStatus,
  Job,
  JobKind,
  JobPage,
  JobStatus,
  Moodboard,
  MoodboardConnector,
  MoodboardConnectorPromotion,
  MoodboardNode,
  MoodboardNodePatch,
  OutcomeComparison,
  Playtest,
  PlaytestPage,
  PlaytestStatus,
  Project,
  ProjectPage,
  ProjectStatus,
  PromoteEntityInput,
  PromotionResult,
  PrototypeContents,
  PrototypeVersion,
  PrototypeVersionComparison,
  PrototypeVersionPage,
  PrototypeVersionStatus,
  RelationshipDirection,
  RelationType,
  RestoreDocumentVersionInput,
  ReviewDecision,
  ReviewState,
  ReviewStatus,
  ReviewTargetType,
  SearchResultPage,
  SearchSourceType,
  SnapshotDocumentInput,
  UpdateEntityInput,
  UpdateProjectInput,
  VersionReason,
} from '@level-zero/domain';

import { env } from './env';
import type { HealthReport } from './health';

/** Shape of an error response written by `DomainExceptionFilter`. */
interface ApiErrorBody {
  statusCode?: number;
  error?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * The message to show a user for a failed request. The API's own message is
 * the useful one whenever it reached us; anything else is a transport failure.
 */
export function apiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong talking to the API.',
): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

/** Joins query params, dropping `undefined`/empty values and comma-joining arrays. */
function toQueryString(params: object): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch((): ApiErrorBody => ({}));
    throw new ApiRequestError(
      body.message ?? `Request failed (${response.status})`,
      response.status,
      body.error,
      body.details,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
}

function patch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

function put<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

/**
 * Reads the API's health summary. The summary endpoint answers 200 even when a
 * dependency is down, so the panel can show *which* one is broken.
 */
export function fetchHealth(signal?: AbortSignal): Promise<HealthReport> {
  return apiFetch('/api/health', signal ? { signal } : {});
}

// --- Projects ----------------------------------------------------------

export interface ListProjectsParams {
  status?: ProjectStatus[];
  search?: string;
  limit?: number;
  offset?: number;
}

export function listProjects(params: ListProjectsParams = {}): Promise<ProjectPage> {
  return apiFetch(`/api/projects${toQueryString(params)}`);
}

export function getProject(projectId: string): Promise<Project> {
  return apiFetch(`/api/projects/${projectId}`);
}

export function createProject(input: CreateProjectInput): Promise<Project> {
  return post('/api/projects', input);
}

export function updateProject(projectId: string, patchInput: UpdateProjectInput): Promise<Project> {
  return patch(`/api/projects/${projectId}`, patchInput);
}

export function archiveProject(projectId: string): Promise<Project> {
  return post(`/api/projects/${projectId}/archive`);
}

export function restoreProject(projectId: string): Promise<Project> {
  return post(`/api/projects/${projectId}/restore`);
}

// --- Entities ------------------------------------------------------------

export interface ListEntitiesParams {
  type?: EntityType[];
  status?: EntityStatus[];
  tag?: string[];
  search?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export function listEntities(
  projectId: string,
  params: ListEntitiesParams = {},
): Promise<EntityPage> {
  return apiFetch(`/api/projects/${projectId}/entities${toQueryString(params)}`);
}

export function getEntity(projectId: string, entityId: string): Promise<Entity> {
  return apiFetch(`/api/projects/${projectId}/entities/${entityId}`);
}

export function createEntity(
  projectId: string,
  input: Omit<CreateEntityInput, 'projectId'>,
): Promise<Entity> {
  return post(`/api/projects/${projectId}/entities`, input);
}

export function updateEntity(
  projectId: string,
  entityId: string,
  patchInput: UpdateEntityInput,
): Promise<Entity> {
  return patch(`/api/projects/${projectId}/entities/${entityId}`, patchInput);
}

export interface FindOrCreateAssetReferenceInput {
  assetId: string;
  name: string;
}

/**
 * Resolves the `asset_reference` entity for an asset, reusing an existing
 * one (active or archived) rather than creating a duplicate. Resolved
 * server-side in one request — see `EntityService.findOrCreateAssetReference`.
 */
export function findOrCreateAssetReference(
  projectId: string,
  input: FindOrCreateAssetReferenceInput,
): Promise<Entity> {
  return post(`/api/projects/${projectId}/entities/asset-references/find-or-create`, input);
}

export function archiveEntity(projectId: string, entityId: string): Promise<Entity> {
  return post(`/api/projects/${projectId}/entities/${entityId}/archive`);
}

export function restoreEntity(projectId: string, entityId: string): Promise<Entity> {
  return post(`/api/projects/${projectId}/entities/${entityId}/restore`);
}

// --- Relationships & lineage ----------------------------------------------

export interface NeighborhoodParams {
  direction?: RelationshipDirection;
  relation?: RelationType[];
}

export function getEntityNeighborhood(
  projectId: string,
  entityId: string,
  params: NeighborhoodParams = {},
): Promise<EntityNeighborhood> {
  return apiFetch(
    `/api/projects/${projectId}/entities/${entityId}/relationships${toQueryString(params)}`,
  );
}

export function promoteEntity(
  projectId: string,
  entityId: string,
  input: PromoteEntityInput,
): Promise<PromotionResult> {
  return post(`/api/projects/${projectId}/entities/${entityId}/promote`, input);
}

export interface CreateRelationshipInput {
  targetEntityId: string;
  relation: RelationType;
  metadata?: Record<string, unknown>;
}

/** The edge is written from `entityId`, so it reads source-first: `A depends_on B`. */
export function createRelationship(
  projectId: string,
  entityId: string,
  input: CreateRelationshipInput,
): Promise<EntityRelationship> {
  return post(`/api/projects/${projectId}/entities/${entityId}/relationships`, input);
}

/** Structural links only — the API answers 409 for lineage relations. */
export function deleteRelationship(
  projectId: string,
  entityId: string,
  relationshipId: string,
): Promise<void> {
  return apiFetch(
    `/api/projects/${projectId}/entities/${entityId}/relationships/${relationshipId}`,
    { method: 'DELETE' },
  );
}

// --- Entity versions -----------------------------------------------------

export function getEntityHistory(projectId: string, entityId: string): Promise<EntityHistory> {
  return apiFetch(`/api/projects/${projectId}/entities/${entityId}/versions`);
}

/** Records the entity's current content as a version; editing alone does not. */
export function commitEntityVersion(
  projectId: string,
  entityId: string,
  input: { reason?: VersionReason; metadata?: Record<string, unknown> } = {},
): Promise<EntityVersion> {
  return post(`/api/projects/${projectId}/entities/${entityId}/versions`, input);
}

/** Re-applies a version as a new version; everything after it stays reachable. */
export function restoreEntityVersion(
  projectId: string,
  entityId: string,
  versionId: string,
): Promise<EntityVersion> {
  return post(`/api/projects/${projectId}/entities/${entityId}/versions/${versionId}/restore`, {});
}

/** Starts a separate line of work from a version. The original line is untouched. */
export function branchEntityVersion(
  projectId: string,
  entityId: string,
  versionId: string,
  input: { branchName: string },
): Promise<EntityVersion> {
  return post(
    `/api/projects/${projectId}/entities/${entityId}/versions/${versionId}/branch`,
    input,
  );
}

// --- Documents -----------------------------------------------------------

export interface ListDocumentsParams {
  search?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

/** Listing returns the document entities; `getDocument` adds the body and history. */
export function listDocuments(
  projectId: string,
  params: ListDocumentsParams = {},
): Promise<EntityPage> {
  return apiFetch(`/api/projects/${projectId}/documents${toQueryString(params)}`);
}

export function getDocument(projectId: string, documentId: string): Promise<Document> {
  return apiFetch(`/api/projects/${projectId}/documents/${documentId}`);
}

export function createDocument(projectId: string, input: CreateDocumentInput): Promise<Document> {
  return post(`/api/projects/${projectId}/documents`, input);
}

/** Seeds the GDD starting structure into a document that has nothing in it yet (#189). */
export function applyDocumentStartingStructure(
  projectId: string,
  documentId: string,
): Promise<Document> {
  return post(`/api/projects/${projectId}/documents/${documentId}/starting-structure`);
}

/** Autosave. The API replaces the body and deliberately writes no version. */
export function saveDocumentContent(
  projectId: string,
  documentId: string,
  content: DocumentContent,
): Promise<Document> {
  return put(`/api/projects/${projectId}/documents/${documentId}/content`, { content });
}

/** Records the body as it stands as a permanent version. */
export function snapshotDocument(
  projectId: string,
  documentId: string,
  input: SnapshotDocumentInput,
): Promise<DocumentVersion> {
  return post(`/api/projects/${projectId}/documents/${documentId}/versions`, input);
}

export interface ListDocumentVersionsParams {
  limit?: number;
  offset?: number;
}

/** The history list: version metadata only, without a body per entry. */
export function listDocumentVersions(
  projectId: string,
  documentId: string,
  params: ListDocumentVersionsParams = {},
): Promise<DocumentHistory> {
  return apiFetch(
    `/api/projects/${projectId}/documents/${documentId}/versions${toQueryString(params)}`,
  );
}

/** One version with the body it holds, to read it or preview a restore. */
export function getDocumentVersion(
  projectId: string,
  documentId: string,
  versionId: string,
): Promise<DocumentVersionSnapshot> {
  return apiFetch(`/api/projects/${projectId}/documents/${documentId}/versions/${versionId}`);
}

/** Brings this version's body back as a new version. Later history is kept. */
export function restoreDocumentVersion(
  projectId: string,
  documentId: string,
  versionId: string,
  input: RestoreDocumentVersionInput = {},
): Promise<DocumentVersion> {
  return post(
    `/api/projects/${projectId}/documents/${documentId}/versions/${versionId}/restore`,
    input,
  );
}

export interface SuggestDocumentEditInput {
  action: string;
  instruction: string;
  /** The passage being rewritten; omitted for an `/ai` request at the caret. */
  selection?: string;
  mentionedEntityIds?: string[];
}

/** The suggested prose, and the generation record that explains where it came from. */
export interface DocumentSuggestion {
  generationId: string;
  suggestion: string;
}

/**
 * Asks for one inline AI edit. This answers in the request rather than through
 * a job: the writer is watching a spinner on the suggestion card, and nothing
 * is written to the document either way until they accept.
 */
export function suggestDocumentEdit(
  projectId: string,
  documentId: string,
  input: SuggestDocumentEditInput,
  signal?: AbortSignal,
): Promise<DocumentSuggestion> {
  return apiFetch(`/api/projects/${projectId}/documents/${documentId}/ai/suggestions`, {
    method: 'POST',
    body: JSON.stringify(input),
    ...(signal ? { signal } : {}),
  });
}

// --- Assets ---------------------------------------------------------------

export interface ListAssetsParams {
  kind?: AssetKind[];
  status?: AssetStatus[];
  search?: string;
  /** The asset a derivative was made from — thumbnails and previews of one file. */
  sourceAssetId?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * The project's files. An asset is not an entity: a tool that shows one links
 * to it through an `asset_reference` entity and the relationship graph, so
 * nothing here creates or resolves those links.
 */
export function listAssets(projectId: string, params: ListAssetsParams = {}): Promise<AssetPage> {
  return apiFetch(`/api/projects/${projectId}/assets${toQueryString(params)}`);
}

export interface ListAssetLibraryParams {
  kind?: AssetKind[];
  /** The part of `mimeType` before the slash: "image", "video", "audio", "application", ... */
  mimeFamily?: string[];
  search?: string;
  /** Generated-vs-imported (#170). */
  origin?: AssetOrigin;
  markKinds?: AssetMarkKind[];
  selectionStates?: AssetSelectionState[];
  linkedEntityId?: string;
  /** Inclusive lower bound on `createdAt`, as an ISO date string. */
  createdAfter?: string;
  /** Exclusive upper bound on `createdAt`, as an ISO date string. */
  createdBefore?: string;
  includeArchived?: boolean;
  sortBy?: AssetSortField;
  sortDirection?: AssetSortDirection;
  limit?: number;
  offset?: number;
}

/**
 * The asset library's joined read model (#169/#170): the same project-scoped
 * page `listAssets` returns, plus one `AssetSummary` per item — in the same
 * order — so a grid or table can show a badge without a follow-up request
 * per tile. `summary=true` is what switches the API over to this view.
 *
 * Every field here round-trips to the server (#172's toolbar) — there is no
 * client-side narrowing of an already-fetched page.
 */
export function listAssetLibrary(
  projectId: string,
  params: ListAssetLibraryParams = {},
): Promise<AssetLibraryPage> {
  return apiFetch(
    `/api/projects/${projectId}/assets${toQueryString({ ...params, summary: true })}`,
  );
}

/**
 * How an asset came to exist: the generation whose output it is, where there
 * was one. Provenance is read from the generation, because an asset carries no
 * link back to the act that made it.
 */
export function listGenerationsForAsset(
  projectId: string,
  assetId: string,
): Promise<GenerationPage> {
  return apiFetch(
    `/api/projects/${projectId}/generations${toQueryString({ outputAssetId: assetId, limit: 1 })}`,
  );
}

export function getAsset(projectId: string, assetId: string): Promise<Asset> {
  return apiFetch(`/api/projects/${projectId}/assets/${assetId}`);
}

export interface UploadAssetInput {
  kind: AssetKind;
  filename: string;
  mimeType: string;
  contentBase64: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface UploadAssetOptions {
  /** Fraction of the request body sent so far, 0–1. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Imports a file into the project as an ordinary asset (#174). Goes through
 * `XMLHttpRequest` rather than `fetch`, which has no cross-browser way to
 * report how much of a request body has actually gone out — the one thing
 * `apiFetch` doesn't need to do for anything else in this file.
 */
export function uploadAsset(
  projectId: string,
  input: UploadAssetInput,
  options: UploadAssetOptions = {},
): Promise<Asset> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/assets`);
    request.setRequestHeader('Content-Type', 'application/json');

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
    };

    request.onload = () => {
      let body: ApiErrorBody | Asset | undefined;
      try {
        body = request.responseText ? JSON.parse(request.responseText) : undefined;
      } catch {
        body = undefined;
      }

      if (request.status >= 200 && request.status < 300) {
        resolve(body as Asset);
      } else {
        const error = (body ?? {}) as ApiErrorBody;
        reject(
          new ApiRequestError(
            error.message ?? `Request failed (${request.status})`,
            request.status,
            error.error,
            error.details,
          ),
        );
      }
    };

    request.onerror = () => reject(new ApiRequestError('Network error while uploading', 0));
    request.onabort = () => reject(new ApiRequestError('Upload cancelled', 0));

    if (options.signal) {
      if (options.signal.aborted) {
        request.abort();
        return;
      }
      options.signal.addEventListener('abort', () => request.abort());
    }

    request.send(JSON.stringify(input));
  });
}

/** The asset's bytes, streamed by the API — usable directly as an `<img src>`. */
export function assetContentUrl(projectId: string, assetId: string): string {
  return `${env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/assets/${assetId}/content`;
}

/**
 * The same bytes, asked for as a file: the API answers with a
 * `Content-Disposition`, so the browser saves it rather than navigating to it.
 */
export function assetDownloadUrl(projectId: string, assetId: string): string {
  return `${assetContentUrl(projectId, assetId)}?download=true`;
}

export function archiveAsset(projectId: string, assetId: string): Promise<Asset> {
  return post(`/api/projects/${projectId}/assets/${assetId}/archive`);
}

export function restoreAsset(projectId: string, assetId: string): Promise<Asset> {
  return post(`/api/projects/${projectId}/assets/${assetId}/restore`);
}

// --- Generations ----------------------------------------------------------

/** What the user pointed at, for the API's `ContextResolver` to assemble. */
export interface GenerationContextInput {
  selectedEntityIds?: string[];
  mentionedEntityIds?: string[];
  /** Assets chosen as references: the image being edited, a style plate. */
  assetIds?: string[];
  relatedDepth?: number;
}

export interface CreateGenerationInput {
  capability: AiCapability;
  prompt: string;
  parameters?: Record<string, unknown>;
  context?: GenerationContextInput;
  /** The generation this one re-rolls or refines. */
  parentGenerationId?: string;
  createdBy?: string;
}

/**
 * Records the ask and queues the work; the provider call happens in the worker.
 *
 * The returned generation is `queued` and carries no output yet — its id is the
 * handle for the job, the progress and the results that follow.
 */
export function createGeneration(
  projectId: string,
  input: CreateGenerationInput,
): Promise<Generation> {
  return post(`/api/projects/${projectId}/generations`, input);
}

export interface ListGenerationsParams {
  status?: GenerationStatus[];
  capability?: AiCapability;
  parentGenerationId?: string;
  outputAssetId?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
}

export function listGenerations(
  projectId: string,
  params: ListGenerationsParams = {},
): Promise<GenerationPage> {
  return apiFetch(`/api/projects/${projectId}/generations${toQueryString(params)}`);
}

export function getGeneration(projectId: string, generationId: string): Promise<Generation> {
  return apiFetch(`/api/projects/${projectId}/generations/${generationId}`);
}

/** The record with its inputs, project context, outputs and parent resolved. */
export function getGenerationProvenance(
  projectId: string,
  generationId: string,
): Promise<GenerationProvenance> {
  return apiFetch(`/api/projects/${projectId}/generations/${generationId}/provenance`);
}

/** Stops the generation and the job running it. Work already inside a provider call finishes. */
export function cancelGeneration(projectId: string, generationId: string): Promise<Generation> {
  return post(`/api/projects/${projectId}/generations/${generationId}/cancel`);
}

// --- Jobs -----------------------------------------------------------------

export interface ListJobsParams {
  status?: JobStatus[];
  kind?: JobKind;
  /** The record the job acts on — a generation id, for `generation` jobs. */
  targetId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Background work and how far it has got.
 *
 * The job row is the source of truth for progress, so a browser that reloads
 * reads this and picks the work up where it left off rather than starting over.
 */
export function listJobs(projectId: string, params: ListJobsParams = {}): Promise<JobPage> {
  return apiFetch(`/api/projects/${projectId}/jobs${toQueryString(params)}`);
}

/**
 * Where to subscribe for job changes as they happen (`EventSource`).
 *
 * A URL rather than a subscription, because `fetch` is the wrong transport for
 * this one endpoint and everything else in this module goes through it.
 */
export function jobStreamUrl(projectId: string): string {
  return `${env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/jobs/stream`;
}

// --- Moodboards -----------------------------------------------------------

/**
 * A board and everything on it.
 *
 * The board is a `moodboard` entity, so it is created, renamed and archived
 * through the entities endpoints above. These calls only ever touch layout —
 * placing an asset on a board never copies it, and removing it never archives
 * it.
 */
export function getMoodboard(projectId: string, boardId: string): Promise<Moodboard> {
  return apiFetch(`/api/projects/${projectId}/moodboards/${boardId}`);
}

export interface AddMoodboardNodeInput {
  type: MoodboardNode['type'];
  assetId?: string;
  entityId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  zOrder?: number;
  groupId?: string | null;
  locked?: boolean;
  data?: Record<string, unknown>;
}

export function addMoodboardNode(
  projectId: string,
  boardId: string,
  input: AddMoodboardNodeInput,
): Promise<MoodboardNode> {
  return post(`/api/projects/${projectId}/moodboards/${boardId}/nodes`, input);
}

/** One request for one gesture: a drag moves the whole selection. */
export function updateMoodboardNodes(
  projectId: string,
  boardId: string,
  nodes: readonly MoodboardNodePatch[],
): Promise<MoodboardNode[]> {
  return patch(`/api/projects/${projectId}/moodboards/${boardId}/nodes`, { nodes });
}

export function duplicateMoodboardNodes(
  projectId: string,
  boardId: string,
  nodeIds: readonly string[],
): Promise<MoodboardNode[]> {
  return post(`/api/projects/${projectId}/moodboards/${boardId}/nodes/duplicate`, { nodeIds });
}

/** Removes the placement. The asset or entity it pointed at is untouched. */
export function removeMoodboardNode(
  projectId: string,
  boardId: string,
  nodeId: string,
): Promise<void> {
  return apiFetch(`/api/projects/${projectId}/moodboards/${boardId}/nodes/${nodeId}`, {
    method: 'DELETE',
  });
}

/** Removes multiple placements in one request. The assets or entities they pointed at are untouched. */
export function removeMoodboardNodes(
  projectId: string,
  boardId: string,
  nodeIds: readonly string[],
): Promise<void> {
  return post(`/api/projects/${projectId}/moodboards/${boardId}/nodes/remove`, { nodeIds });
}

export function connectMoodboardNodes(
  projectId: string,
  boardId: string,
  input: { fromNodeId: string; toNodeId: string; label?: string },
): Promise<MoodboardConnector> {
  return post(`/api/projects/${projectId}/moodboards/${boardId}/connectors`, input);
}

export function deleteMoodboardConnector(
  projectId: string,
  boardId: string,
  connectorId: string,
): Promise<void> {
  return apiFetch(`/api/projects/${projectId}/moodboards/${boardId}/connectors/${connectorId}`, {
    method: 'DELETE',
  });
}

/** The one call that turns a line on a board into an edge in the project graph. */
export function promoteMoodboardConnector(
  projectId: string,
  boardId: string,
  connectorId: string,
  relation: RelationType,
): Promise<MoodboardConnectorPromotion> {
  return post(
    `/api/projects/${projectId}/moodboards/${boardId}/connectors/${connectorId}/promote`,
    { relation },
  );
}

// --- Search ---------------------------------------------------------------

export interface SearchParams {
  /** What to search for. Optional for `keyword`, which browses without it. */
  q?: string;
  /** `keyword` matches the words; `semantic` matches what they mean. */
  mode?: 'keyword' | 'semantic';
  sourceType?: SearchSourceType[];
  /** Scopes to entity types — this is what a local, per-tool search sends. */
  entityType?: EntityType[];
  status?: string[];
  tag?: string[];
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

/** One entry point over entities, documents, assets and generations. */
export function searchProject(
  projectId: string,
  params: SearchParams = {},
): Promise<SearchResultPage> {
  return apiFetch(`/api/projects/${projectId}/search${toQueryString(params)}`);
}

// --- Findings ---------------------------------------------------------------

export interface ListFindingsParams {
  status?: FindingStatus[];
  checkId?: string;
  limit?: number;
  offset?: number;
}

/** The Consistency surface's findings — what the last project-wide scan saw. */
export function listFindings(
  projectId: string,
  params: ListFindingsParams = {},
): Promise<FindingPage> {
  return apiFetch(`/api/projects/${projectId}/findings${toQueryString(params)}`);
}

/**
 * Queues a project-wide consistency scan and answers with the job running it.
 * A scan already in flight is returned rather than queueing a second one.
 */
export function requestConsistencyScan(projectId: string): Promise<Job> {
  return post(`/api/projects/${projectId}/findings/scan`);
}

export interface DismissFindingParams {
  dismissedBy: string;
  reason?: string;
}

/** Records the finding as a known, accepted state. The row survives. */
export function dismissFinding(
  projectId: string,
  findingId: string,
  input: DismissFindingParams,
): Promise<Finding> {
  return post(`/api/projects/${projectId}/findings/${findingId}/dismiss`, input);
}

/** Undoes a dismissal — one click, per the finding lifecycle's own rule. */
export function reopenFinding(projectId: string, findingId: string): Promise<Finding> {
  return post(`/api/projects/${projectId}/findings/${findingId}/reopen`);
}

// --- Prototypes -------------------------------------------------------------

/**
 * A prototype's captured versions, newest first. The prototype itself is a
 * `prototype` entity — read and edited through the entities endpoints above —
 * so this only ever reaches its version history.
 */
export function listPrototypeVersions(
  projectId: string,
  prototypeId: string,
  params: { limit?: number; offset?: number } = {},
): Promise<PrototypeVersionPage> {
  return apiFetch(
    `/api/projects/${projectId}/prototypes/${prototypeId}/versions${toQueryString(params)}`,
  );
}

/** A version's pinned entity versions and build artifact, resolved. */
export function getPrototypeVersionContents(
  projectId: string,
  prototypeId: string,
  prototypeVersionId: string,
): Promise<PrototypeContents> {
  return apiFetch(
    `/api/projects/${projectId}/prototypes/${prototypeId}/versions/${prototypeVersionId}/contents`,
  );
}

/** Which entity versions were added, removed or changed between two versions of the same prototype. */
export function comparePrototypeVersions(
  projectId: string,
  prototypeId: string,
  from: string,
  to: string,
): Promise<PrototypeVersionComparison> {
  return apiFetch(
    `/api/projects/${projectId}/prototypes/${prototypeId}/versions/compare${toQueryString({ from, to })}`,
  );
}

export interface AnnotatePrototypeVersionParams {
  status?: PrototypeVersionStatus;
  notes?: string | null;
  buildAssetId?: string | null;
}

/** Updates status, notes or the build artifact. The pinned members never change. */
export function annotatePrototypeVersion(
  projectId: string,
  prototypeId: string,
  prototypeVersionId: string,
  input: AnnotatePrototypeVersionParams,
): Promise<PrototypeVersion> {
  return patch(
    `/api/projects/${projectId}/prototypes/${prototypeId}/versions/${prototypeVersionId}`,
    input,
  );
}

/**
 * Two versions read beside the playtests of each: design changes, measured
 * metrics and the categorised words people wrote. Facts only — a model's
 * reading of them is `interpretOutcomes` below.
 */
export function compareOutcomes(
  projectId: string,
  prototypeId: string,
  from: string,
  to: string,
): Promise<OutcomeComparison> {
  return apiFetch(
    `/api/projects/${projectId}/prototypes/${prototypeId}/versions/outcomes${toQueryString({ from, to })}`,
  );
}

/** An interpretation, and the `Generation` that says where it came from. */
export interface OutcomeInterpretation {
  generationId: string;
  interpretation: string;
}

/**
 * One model's reading of that comparison. The facts are re-read server-side,
 * so an interpretation can only ever be of what is recorded.
 */
export function interpretOutcomes(
  projectId: string,
  prototypeId: string,
  input: { from: string; to: string; createdBy?: string },
): Promise<OutcomeInterpretation> {
  return post(
    `/api/projects/${projectId}/prototypes/${prototypeId}/versions/outcomes/interpretation`,
    input,
  );
}

// --- Playtests ----------------------------------------------------------------

export interface ListPlaytestsParams {
  /** Scopes to playtests of one exact prototype version — there is no prototype-level scope. */
  prototypeVersionId?: string;
  tag?: string[];
  limit?: number;
  offset?: number;
}

/** Evidence about one exact prototype version. */
export function listPlaytests(
  projectId: string,
  params: ListPlaytestsParams = {},
): Promise<PlaytestPage> {
  return apiFetch(`/api/projects/${projectId}/playtests${toQueryString(params)}`);
}

export interface CreatePlaytestParams {
  /** The exact version this playtest is evidence about; never rewritten after creation. */
  prototypeVersionId: string;
  name: string;
  goal?: string | null;
  status?: PlaytestStatus;
  createdBy?: string | null;
}

export function createPlaytest(projectId: string, input: CreatePlaytestParams): Promise<Playtest> {
  return post(`/api/projects/${projectId}/playtests`, input);
}

// --- Contextual AI inspector ---------------------------------------------

/** The capabilities this deployment can serve inline, so unavailable actions can say so. */
export function listAiCapabilities(projectId: string): Promise<{ capabilities: AiCapability[] }> {
  return apiFetch(`/api/projects/${projectId}/ai/capabilities`);
}

export interface RunAiActionInput {
  /** Which inspector action asked, recorded on the generation. */
  action: string;
  capability: AiCapability;
  instruction: string;
  /** The selected entity, for an entity subject. Empty for a project-level ask. */
  selectedEntityIds?: string[];
  mentionedEntityIds?: string[];
  /** The selected file, for an asset subject. */
  assetIds?: string[];
  /** Workspace material the relationship graph does not hold. */
  excerpt?: string;
  /** Hops to follow out from the subject. `0` asks about the subject alone. */
  relatedDepth?: number;
  createdBy?: string;
}

export interface AiActionResult {
  generationId: string;
  action: string;
  capability: AiCapability;
  /** The recommendation. Nothing is written to the project until it is accepted. */
  output: string;
  /** The project material the request carried, for the inspector's disclosure. */
  context: ResolvedContext;
}

/**
 * Runs one contextual AI action. Answers in the request rather than through a
 * job: the user is watching a spinner in a 320px panel, and nothing reaches
 * the project either way until they accept the result.
 */
export function runAiAction(
  projectId: string,
  input: RunAiActionInput,
  signal?: AbortSignal,
): Promise<AiActionResult> {
  return apiFetch(`/api/projects/${projectId}/ai/actions`, {
    method: 'POST',
    body: JSON.stringify(input),
    ...(signal ? { signal } : {}),
  });
}

export interface AcceptAiActionInput {
  name: string;
  text: string;
  tags?: string[];
}

/**
 * Accepts one recommendation, as a draft `idea` carrying `generated_from`
 * edges back to everything the request went in with. The subject is untouched:
 * this is the only call in the flow that writes to the project, and it only
 * ever adds.
 */
export function acceptAiActionResult(
  projectId: string,
  generationId: string,
  input: AcceptAiActionInput,
): Promise<Entity> {
  return post(`/api/projects/${projectId}/ai/actions/${generationId}/apply`, input);
}

// --- Comments and review ----------------------------------------------------

/**
 * What a comment or a review decision is about: an entity (a document
 * included), an asset or a prototype version, optionally narrowed to a stable
 * anchor inside it.
 */
export interface ReviewTargetParams {
  targetType: ReviewTargetType;
  targetId: string;
  anchor?: string;
}

/**
 * The same address with no anchor: the target as a whole, every section of it
 * included. What the two anchored listings below are read by.
 */
export type AnchoredTargetParams = Omit<ReviewTargetParams, 'anchor'>;

/** The target's threads, oldest first, each with its replies. */
export function listCommentThreads(
  projectId: string,
  target: ReviewTargetParams,
): Promise<CommentThread[]> {
  return apiFetch(`/api/projects/${projectId}/comments${toQueryString(target)}`);
}

/**
 * Every thread anchored inside the target, whichever section — each thread's
 * own `target.anchor` says which. The threads whose section has been deleted
 * come back here too, because nothing else can name them.
 */
export function listAnchoredCommentThreads(
  projectId: string,
  target: AnchoredTargetParams,
): Promise<CommentThread[]> {
  return apiFetch(`/api/projects/${projectId}/comments/anchored${toQueryString(target)}`);
}

export interface CreateCommentInput extends ReviewTargetParams {
  /** Free text until authentication lands; then the session's user. */
  author: string;
  body: string;
}

export function createComment(projectId: string, input: CreateCommentInput): Promise<Comment> {
  return post(`/api/projects/${projectId}/comments`, input);
}

export function replyToComment(
  projectId: string,
  commentId: string,
  input: { author: string; body: string },
): Promise<Comment> {
  return post(`/api/projects/${projectId}/comments/${commentId}/replies`, input);
}

/** The author's own text, rewritten. Anyone else gets a 403. */
export function updateComment(
  projectId: string,
  commentId: string,
  input: { actor: string; body: string },
): Promise<Comment> {
  return patch(`/api/projects/${projectId}/comments/${commentId}`, input);
}

/** Deleting the comment that starts a thread deletes the replies under it. */
export function deleteComment(projectId: string, commentId: string, actor: string): Promise<void> {
  return apiFetch(`/api/projects/${projectId}/comments/${commentId}${toQueryString({ actor })}`, {
    method: 'DELETE',
  });
}

export function resolveComment(
  projectId: string,
  commentId: string,
  actor: string,
): Promise<Comment> {
  return post(`/api/projects/${projectId}/comments/${commentId}/resolve`, { actor });
}

export function reopenComment(projectId: string, commentId: string): Promise<Comment> {
  return post(`/api/projects/${projectId}/comments/${commentId}/reopen`);
}

/**
 * Where the target stands. `target` comes back null when the thing reviewed no
 * longer resolves, and the state is still reported.
 */
export function getReviewStatus(
  projectId: string,
  target: ReviewTargetParams,
): Promise<ReviewStatus> {
  return apiFetch(`/api/projects/${projectId}/reviews${toQueryString(target)}`);
}

/** Every decision about the target, newest first. Nothing is ever overwritten. */
export function listReviewHistory(
  projectId: string,
  target: ReviewTargetParams,
): Promise<ReviewDecision[]> {
  return apiFetch(`/api/projects/${projectId}/reviews/history${toQueryString(target)}`);
}

/** Where each anchored section of the target stands. Anchors nobody has decided
 * anything about are absent, and read as draft by that absence. */
export function listAnchoredReviewStatuses(
  projectId: string,
  target: AnchoredTargetParams,
): Promise<AnchoredReviewStatus[]> {
  return apiFetch(`/api/projects/${projectId}/reviews/anchored${toQueryString(target)}`);
}

export interface RecordReviewDecisionInput extends ReviewTargetParams {
  state: ReviewState;
  /** Free text until authentication lands; then the session's user. */
  actor: string;
  note?: string;
  /** An entity version to judge. Left out, a judgement lands on the current one. */
  versionId?: string;
}

export function recordReviewDecision(
  projectId: string,
  input: RecordReviewDecisionInput,
): Promise<ReviewDecision> {
  return post(`/api/projects/${projectId}/reviews`, input);
}

// --- Asset selection ------------------------------------------------------

/** What is approved for one purpose now, and every decision behind it. */
export function getAssetSelectionSummary(
  projectId: string,
  context: AssetSelectionContext,
): Promise<AssetSelectionSummary> {
  return apiFetch(`/api/projects/${projectId}/asset-selections${toQueryString(context)}`);
}

/**
 * Every decision made for one entity, across all of its purposes — which is
 * how a character or a location says what it currently stands behind.
 */
export function listEntityAssetSelections(
  projectId: string,
  entityId: string,
): Promise<AssetSelection[]> {
  return apiFetch(`/api/projects/${projectId}/asset-selections/entity/${entityId}`);
}

/** Every decision about one asset, so a rejected concept stays traceable. */
export function listAssetSelectionsForAsset(
  projectId: string,
  assetId: string,
): Promise<AssetSelection[]> {
  return apiFetch(`/api/projects/${projectId}/asset-selections/asset/${assetId}`);
}

export interface DecideAssetSelectionInput extends AssetSelectionContext {
  assetId: string;
  /** Free text until authentication lands; then the session's user. */
  actor: string;
  note?: string;
}

export interface ApproveAssetSelectionInput extends DecideAssetSelectionInput {
  /** Assets this approval replaces, each currently approved for this purpose. */
  supersedes?: string[];
}

export function approveAssetSelection(
  projectId: string,
  input: ApproveAssetSelectionInput,
): Promise<ApproveAssetResult> {
  return post(`/api/projects/${projectId}/asset-selections/approve`, input);
}

export function rejectAssetSelection(
  projectId: string,
  input: DecideAssetSelectionInput,
): Promise<AssetSelection> {
  return post(`/api/projects/${projectId}/asset-selections/reject`, input);
}

/** The project's favourites and shortlist. A grid reads them all in one call. */
export function listAssetMarks(
  projectId: string,
  kinds?: readonly AssetMarkKind[],
): Promise<AssetMark[]> {
  return apiFetch(`/api/projects/${projectId}/asset-marks${toQueryString({ kind: kinds })}`);
}

export function markAsset(
  projectId: string,
  input: { assetId: string; kind: AssetMarkKind; actor: string },
): Promise<AssetMark> {
  return post(`/api/projects/${projectId}/asset-marks`, input);
}

export function unmarkAsset(
  projectId: string,
  assetId: string,
  kind: AssetMarkKind,
): Promise<void> {
  return apiFetch(`/api/projects/${projectId}/asset-marks/${assetId}/${kind}`, {
    method: 'DELETE',
  });
}
