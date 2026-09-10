import type {
  AssetKind,
  AssetPage,
  AssetStatus,
  CreateDocumentInput,
  CreateEntityInput,
  CreateProjectInput,
  Document,
  DocumentContent,
  DocumentVersion,
  Entity,
  EntityHistory,
  EntityNeighborhood,
  EntityPage,
  EntityRelationship,
  EntityStatus,
  EntityType,
  EntityVersion,
  GenerationPage,
  Project,
  ProjectPage,
  ProjectStatus,
  PromoteEntityInput,
  PromotionResult,
  RelationshipDirection,
  RelationType,
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

/** The asset's bytes, streamed by the API — usable directly as an `<img src>`. */
export function assetContentUrl(projectId: string, assetId: string): string {
  return `${env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/assets/${assetId}/content`;
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
