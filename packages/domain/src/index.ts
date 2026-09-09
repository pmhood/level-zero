export type { Brand } from './shared/branded';
export { fixedClock, systemClock, type Clock } from './shared/clock';
export { sequentialIdGenerator, uuidIdGenerator, type IdGenerator } from './shared/id';
export {
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
  isDomainError,
} from './shared/errors';
export {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  normalizePaging,
  type NormalizedPaging,
} from './shared/paging';
export {
  MAX_TAGS,
  MAX_TAG_LENGTH,
  normalizeTags,
  optionalNonNegativeNumber,
  optionalPositiveInt,
  optionalText,
  requireJsonObject,
  requireNonNegativeInt,
  requireOneOf,
  requireText,
} from './shared/validation';

export {
  MAX_PROJECT_DESCRIPTION_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  PROJECT_STATUSES,
  applyProjectUpdate,
  archiveProject,
  createProject,
  restoreProject,
  type CreateProjectInput,
  type Project,
  type ProjectStatus,
  type UpdateProjectInput,
} from './project/project';
export {
  type ProjectListFilter,
  type ProjectPage,
  type ProjectRepository,
} from './project/project-repository';
export { ProjectService, type ProjectServiceDeps } from './project/project-service';

export { ENTITY_TYPES, isEntityType, type EntityType } from './entity/entity-type';
export {
  ENTITY_STATUSES,
  MAX_ENTITY_DESCRIPTION_LENGTH,
  MAX_ENTITY_NAME_LENGTH,
  applyEntityUpdate,
  archiveEntity,
  applyEntitySnapshot,
  createEntity,
  restoreEntity,
  snapshotEntity,
  withCurrentVersion,
  type CreateEntityInput,
  type Entity,
  type EntitySnapshot,
  type EntityStatus,
  type UpdateEntityInput,
} from './entity/entity';
export {
  type EntityListFilter,
  type EntityPage,
  type EntityRepository,
} from './entity/entity-repository';
export { EntityService, type EntityServiceDeps } from './entity/entity-service';

export {
  LINEAGE_RELATION_TYPES,
  RELATION_TYPES,
  isLineageRelation,
  isRelationType,
  type LineageRelationType,
  type RelationType,
} from './relationship/relation-type';
export {
  createEntityRelationship,
  type CreateEntityRelationshipInput,
  type EntityRelationship,
} from './relationship/entity-relationship';
export {
  type EntityRelationshipRepository,
  type RelationshipDirection,
  type RelationshipListFilter,
  type RelationshipPage,
} from './relationship/entity-relationship-repository';
export {
  EntityRelationshipService,
  type EntityNeighborhood,
  type LinkInput,
  type NeighborEdge,
  type RelationshipServiceDeps,
} from './relationship/entity-relationship-service';
export {
  LineageService,
  type PromoteEntityInput,
  type PromotionResult,
} from './relationship/lineage-service';

export {
  DEFAULT_BRANCH,
  MAX_BRANCH_NAME_LENGTH,
  VERSION_REASONS,
  createEntityVersion,
  type CreateEntityVersionInput,
  type EntityVersion,
  type VersionReason,
} from './version/entity-version';
export {
  type EntityVersionRepository,
  type VersionListFilter,
  type VersionPage,
} from './version/entity-version-repository';
export {
  compareVersions,
  diffSnapshots,
  type FieldChange,
  type VersionComparison,
} from './version/compare';
export {
  EntityVersionService,
  type BranchInput,
  type CommitVersionInput,
  type EntityHistory,
  type PromoteVersionInput,
  type VersionServiceDeps,
} from './version/entity-version-service';

export {
  ASSET_KINDS,
  ASSET_STATUSES,
  ASSET_VARIANTS,
  MAX_ASSET_CHECKSUM_LENGTH,
  MAX_ASSET_CREATED_BY_LENGTH,
  MAX_ASSET_FILENAME_LENGTH,
  MAX_ASSET_MIME_TYPE_LENGTH,
  MAX_ASSET_STORAGE_KEY_LENGTH,
  archiveAsset,
  createAsset,
  restoreAsset,
  type Asset,
  type AssetFactoryDeps,
  type AssetKind,
  type AssetStatus,
  type AssetVariant,
  type CreateAssetInput,
} from './asset/asset';
export {
  ASSET_REFERENCE_ASSET_ID_KEY,
  assetReferenceData,
  referencedAssetId,
} from './asset/asset-reference';
export {
  type AssetListFilter,
  type AssetPage,
  type AssetRepository,
} from './asset/asset-repository';
export {
  type GetUrlOptions,
  type ObjectStorageProvider,
  type PutObjectInput,
} from './asset/object-storage';
export {
  AssetService,
  type AssetContent,
  type AssetServiceDeps,
  type UploadAssetInput,
} from './asset/asset-service';

export {
  DEFAULT_GENERATION_FAILURE_CODE,
  GENERATION_STATUSES,
  MAX_GENERATION_CAPABILITY_LENGTH,
  MAX_GENERATION_CREATED_BY_LENGTH,
  MAX_GENERATION_FAILURE_MESSAGE_LENGTH,
  MAX_GENERATION_MODEL_LENGTH,
  MAX_GENERATION_PROMPT_LENGTH,
  MAX_GENERATION_PROVIDER_LENGTH,
  MAX_GENERATION_REQUEST_ID_LENGTH,
  MAX_GENERATION_SEED_LENGTH,
  cancelGeneration,
  completeGeneration,
  createGeneration,
  dispatchGeneration,
  failGeneration,
  type CompleteGenerationInput,
  type CreateGenerationInput,
  type DispatchGenerationInput,
  type FailGenerationInput,
  type Generation,
  type GenerationFactoryDeps,
  type GenerationFailure,
  type GenerationStatus,
} from './generation/generation';
export {
  type GenerationListFilter,
  type GenerationPage,
  type GenerationRepository,
} from './generation/generation-repository';
export {
  GenerationService,
  type FinishGenerationInput,
  type GenerationProvenance,
  type GenerationServiceDeps,
  type RecordGenerationInput,
} from './generation/generation-service';
