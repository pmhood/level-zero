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
  PARAMETER_TYPES,
  PERCENT_UNITS,
  TUNING_PARAMETERS_KEY,
  clampParameterValue,
  createParameter,
  formatParameterValue,
  groupParameters,
  isNumericParameter,
  isParameterType,
  parameterBounds,
  parameterDefinitionIssues,
  parameterId,
  parameterValueIssue,
  readParameters,
  type CreateParameterInput,
  type Parameter,
  type ParameterGroup,
  type ParameterOption,
  type ParameterType,
  type ParameterValue,
} from './parameter/parameter';

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
  redispatchGeneration,
  type CompleteGenerationInput,
  type CreateGenerationInput,
  type DispatchGenerationInput,
  type FailGenerationInput,
  type Generation,
  type GenerationFactoryDeps,
  type GenerationFailure,
  type GenerationStatus,
  type RedispatchGenerationInput,
} from './generation/generation';
export { GENERATION_JOB_STEPS } from './generation/generation-job';
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

export {
  MAX_PROTOTYPE_VERSION_CREATED_BY_LENGTH,
  MAX_PROTOTYPE_VERSION_NAME_LENGTH,
  MAX_PROTOTYPE_VERSION_NOTES_LENGTH,
  PROTOTYPE_VERSION_STATUSES,
  annotatePrototypeVersion,
  createPrototypeVersion,
  type AnnotatePrototypeVersionInput,
  type CreatePrototypeVersionInput,
  type PrototypeMember,
  type PrototypeVersion,
  type PrototypeVersionFactoryDeps,
  type PrototypeVersionStatus,
} from './prototype/prototype-version';
export {
  type PrototypeVersionListFilter,
  type PrototypeVersionPage,
  type PrototypeVersionRepository,
} from './prototype/prototype-version-repository';
export {
  comparePrototypeVersions,
  type PrototypeMemberChange,
  type PrototypeVersionComparison,
} from './prototype/compare';
export {
  PrototypeService,
  type CapturePrototypeVersionInput,
  type CreatePrototypeInput,
  type PrototypeContents,
  type PrototypeCreation,
  type PrototypeMemberInput,
  type PrototypeServiceDeps,
} from './prototype/prototype-service';

export {
  ACTIVE_JOB_STATUSES,
  DEFAULT_JOB_FAILURE_CODE,
  DEFAULT_JOB_MAX_ATTEMPTS,
  JOB_KINDS,
  JOB_STATUSES,
  MAX_JOB_ATTEMPTS,
  MAX_JOB_FAILURE_MESSAGE_LENGTH,
  MAX_JOB_STEPS,
  MAX_JOB_STEP_LENGTH,
  advanceJob,
  cancelJob,
  createJob,
  failJob,
  isJobActive,
  reportJobProgress,
  retryJob,
  type AdvanceJobInput,
  type CreateJobInput,
  type FailJobInput,
  type Job,
  type JobFactoryDeps,
  type JobFailure,
  type JobKind,
  type JobProgress,
  type JobProgressInput,
  type JobStatus,
} from './job/job';
export { type JobListFilter, type JobPage, type JobRepository } from './job/job-repository';
export { type JobQueue } from './job/job-queue';
export { type JobEvents, type JobSubscription } from './job/job-events';
export { JobService, type EnqueueJobInput, type JobServiceDeps } from './job/job-service';

export {
  ACTIVITY_SUBJECT_TYPES,
  ACTIVITY_TYPES,
  MAX_ACTIVITY_ACTOR_LENGTH,
  MAX_ACTIVITY_SUMMARY_LENGTH,
  createActivity,
  truncateForSummary,
  type Activity,
  type ActivityFactoryDeps,
  type ActivitySubjectType,
  type ActivityType,
  type RecordActivityInput,
} from './activity/activity';
export {
  type ActivityListFilter,
  type ActivityPage,
  type ActivityRepository,
} from './activity/activity-repository';
export { ActivityService, type ActivityServiceDeps } from './activity/activity-service';

export {
  DOCUMENT_CONTENT_KEY,
  DOCUMENT_VERSION_GENERATION_KEY,
  DOCUMENT_VERSION_NAME_KEY,
  DOCUMENT_VERSION_REASONS,
  MAX_DOCUMENT_VERSION_NAME_LENGTH,
  MIN_AI_EDIT_VERSION_LENGTH,
  documentBlocks,
  documentContent,
  documentData,
  documentPlainText,
  documentVersionGenerationId,
  documentVersionName,
  emptyDocumentContent,
  isSignificantAiEdit,
  requireDocumentContent,
  type DocumentBlock,
  type DocumentContent,
  type DocumentVersionReason,
} from './document/document';
export {
  DocumentService,
  type CreateDocumentInput,
  type Document,
  type DocumentHistory,
  type DocumentVersion,
  type DocumentVersionComparison,
  type DocumentVersionSnapshot,
  type RestoreDocumentVersionInput,
  type SnapshotDocumentInput,
} from './document/document-service';

export {
  SEARCH_EXCERPT_LENGTH,
  SEARCH_SOURCE_TYPES,
  embeddableText,
  searchDocumentForAsset,
  searchDocumentForEntity,
  searchDocumentForGeneration,
  type SearchDocument,
  type SearchDocumentFactoryDeps,
  type SearchSourceType,
} from './search/search-document';
export { type EmbeddingProvider } from './search/embedding';
export {
  MIN_SEMANTIC_SIMILARITY,
  type SaveEmbeddingInput,
  type SearchDocumentRepository,
  type SearchFilter,
  type SearchResult,
  type SearchResultPage,
} from './search/search-repository';
export { SEARCH_INDEX_JOB_STEPS, type SearchIndexer } from './search/search-indexer';
export { SearchService } from './search/search-service';
export {
  EMBEDDING_BATCH_SIZE,
  SearchIndexService,
  type SearchIndexServiceDeps,
} from './search/search-index-service';

export {
  MAX_DIFFERENCE_VALUE_LENGTH,
  changeOf,
  compactDifferences,
  describeValue,
  difference,
  fieldLabel,
  type Difference,
  type DifferenceChange,
  type DifferenceGroup,
} from './compare/difference';
export {
  DETAILS_GROUP,
  TUNING_GROUP,
  WRITING_GROUP,
  entityVersionDifferences,
} from './compare/entity-differences';
export { parameterDifferences } from './compare/parameter-differences';
export { documentDifferences } from './compare/document-differences';
export {
  FILE_GROUP,
  PROVENANCE_GROUP,
  assetDifferences,
  type AssetComparisonSide,
} from './compare/asset-differences';
export {
  CONTENTS_GROUP,
  PROTOTYPE_DETAILS_GROUP,
  UNAVAILABLE,
  prototypeVersionDifferences,
} from './compare/prototype-differences';
