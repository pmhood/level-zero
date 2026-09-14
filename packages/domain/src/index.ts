export type { Brand } from './shared/branded';
export { fixedClock, systemClock, type Clock } from './shared/clock';
export { sequentialIdGenerator, uuidIdGenerator, type IdGenerator } from './shared/id';
export {
  ConflictError,
  DomainError,
  ForbiddenError,
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
  type FindOrCreateAssetReferenceResult,
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
  PROMOTIONS,
  findPromotion,
  promotionsFor,
  type PromotionDefinition,
} from './promotion/promotion-definition';

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
  MAX_ASSET_UPLOAD_BYTES,
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
  ASSET_SORT_DIRECTIONS,
  ASSET_SORT_FIELDS,
  type AssetListFilter,
  type AssetPage,
  type AssetRepository,
  type AssetSortDirection,
  type AssetSortField,
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
  ASSET_THUMBNAIL_JOB_STEPS,
  PREVIEW_MAX_DIMENSION,
  THUMBNAIL_MAX_DIMENSION,
} from './asset/asset-thumbnail-job';
export {
  ASSET_LINKED_ENTITIES_CAP,
  ASSET_ORIGINS,
  isApprovedInAnyContext,
  pickNewestOrigin,
  summarizeCurrentSelections,
  type AssetGenerationOrigin,
  type AssetLinkedEntitiesSummary,
  type AssetLinkedEntity,
  type AssetOrigin,
  type AssetSelectionSummaryEntry,
  type AssetSummary,
  type OriginCandidate,
} from './asset/asset-summary';
export {
  type AssetLibraryFilter,
  type AssetLibraryPage,
  type AssetLibraryReadModel,
} from './asset/asset-library-read-model';
export { AssetLibraryService } from './asset/asset-library-service';

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
  type GenerationAttempt,
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
  MAX_PLAYTEST_CREATED_BY_LENGTH,
  MAX_PLAYTEST_GOAL_LENGTH,
  MAX_PLAYTEST_NAME_LENGTH,
  MAX_PLAYTEST_SUMMARY_LENGTH,
  PLAYTEST_STATUSES,
  applyPlaytestUpdate,
  createPlaytest,
  type CreatePlaytestInput,
  type Playtest,
  type PlaytestFactoryDeps,
  type PlaytestStatus,
  type UpdatePlaytestInput,
} from './playtest/playtest';
export {
  MAX_PLAYTEST_SESSION_NOTES_LENGTH,
  MAX_PLAYTEST_SESSION_PARTICIPANT_LENGTH,
  createPlaytestSession,
  type CreatePlaytestSessionInput,
  type PlaytestSession,
  type PlaytestSessionFactoryDeps,
} from './playtest/playtest-session';
export {
  MAX_PLAYTEST_OBSERVATION_BODY_LENGTH,
  MAX_PLAYTEST_OBSERVATION_OBSERVED_BY_LENGTH,
  createPlaytestObservation,
  type CreatePlaytestObservationInput,
  type PlaytestObservation,
  type PlaytestObservationFactoryDeps,
} from './playtest/playtest-observation';
export {
  MAX_PLAYTEST_FEEDBACK_AUTHOR_LENGTH,
  MAX_PLAYTEST_FEEDBACK_BODY_LENGTH,
  PLAYTEST_SENTIMENTS,
  createPlaytestFeedback,
  type CreatePlaytestFeedbackInput,
  type PlaytestFeedback,
  type PlaytestFeedbackFactoryDeps,
  type PlaytestSentiment,
} from './playtest/playtest-feedback';
export {
  MAX_PLAYTEST_METRIC_LABEL_LENGTH,
  MAX_PLAYTEST_METRIC_UNIT_LENGTH,
  createPlaytestMetric,
  resolvePlaytestMetricKey,
  type CreatePlaytestMetricInput,
  type PlaytestMetric,
  type PlaytestMetricFactoryDeps,
} from './playtest/playtest-metric';
export {
  type PlaytestListFilter,
  type PlaytestPage,
  type PlaytestRepository,
} from './playtest/playtest-repository';
export {
  PlaytestService,
  type NewPlaytestInput,
  type PlaytestServiceDeps,
  type RecordPlaytestFeedbackInput,
  type RecordPlaytestMetricInput,
  type RecordPlaytestObservationInput,
  type RecordPlaytestSessionInput,
} from './playtest/playtest-service';

export {
  compareOutcomes,
  type CategoryGroup,
  type DesignChange,
  type MetricChange,
  type OutcomeComparison,
  type OutcomeSide,
  type PinnedEntityVersion,
  type PlaytestEvidence,
} from './outcome/outcome-comparison';
export { OutcomeComparisonService } from './outcome/outcome-comparison-service';
export {
  INTERPRETATION_FORMAT_INSTRUCTION,
  outcomeInterpretationPrompt,
} from './outcome/outcome-interpretation';

export {
  DEFAULT_MOODBOARD_NODE_SIZE,
  MOODBOARD_NODE_TYPES,
  createMoodboardNode,
  updateMoodboardNode,
  type CreateMoodboardNodeInput,
  type MoodboardNode,
  type MoodboardNodeFactoryDeps,
  type MoodboardNodeLayout,
  type MoodboardNodeType,
  type UpdateMoodboardNodeInput,
} from './moodboard/moodboard-node';
export {
  MAX_MOODBOARD_CONNECTOR_LABEL_LENGTH,
  createMoodboardConnector,
  type CreateMoodboardConnectorInput,
  type MoodboardConnector,
  type MoodboardConnectorFactoryDeps,
} from './moodboard/moodboard-connector';
export { type MoodboardRepository } from './moodboard/moodboard-repository';
export {
  DUPLICATE_MOODBOARD_NODE_OFFSET,
  MoodboardService,
  type AddMoodboardNodeInput,
  type ConnectMoodboardNodesInput,
  type Moodboard,
  type MoodboardConnectorPromotion,
  type MoodboardNodePatch,
  type MoodboardServiceDeps,
} from './moodboard/moodboard-service';

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
  FINDING_ORIGINS,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  MAX_FINDING_CHECK_ID_LENGTH,
  MAX_FINDING_DISMISSED_BY_LENGTH,
  MAX_FINDING_DISMISSED_REASON_LENGTH,
  MAX_FINDING_EVIDENCE_ENTITY_ID_LENGTH,
  MAX_FINDING_EVIDENCE_STATES_LENGTH,
  MAX_FINDING_EVIDENCE_WHERE_LENGTH,
  MAX_FINDING_FINGERPRINT_LENGTH,
  MAX_FINDING_SUMMARY_LENGTH,
  MIN_FINDING_EVIDENCE,
  createFinding,
  dismissFinding,
  reopenFinding,
  resolveFinding,
  type CheckFinding,
  type CreateFindingInput,
  type DismissFindingInput,
  type Finding,
  type FindingEvidence,
  type FindingFactoryDeps,
  type FindingOrigin,
  type FindingSeverity,
  type FindingStatus,
} from './finding/finding';
export { fingerprint, type ConsistencyCheck, type ProjectFacts } from './finding/consistency-check';
export {
  type AiCheckCandidate,
  type AiCheckContext,
  type AiCheckResult,
  type AiConsistencyCheck,
  type AiJudgement,
  type AiJudgementRequest,
  type AiRetrievalRequest,
} from './finding/ai-consistency-check';
export { JUDGEMENT_FORMAT_INSTRUCTION, parseJudgedFindings } from './finding/ai-judgement';
export { stalePrototypePinCheck } from './finding/stale-prototype-pin-check';
export { duplicateNameCheck, normalizedEntityName } from './finding/duplicate-name-check';
export { loreContradictionCheck } from './finding/lore-contradiction-check';
export { nearDuplicateCheck } from './finding/near-duplicate-check';
export { CONSISTENCY_CHECKS } from './finding/consistency-checks';
export { AI_CONSISTENCY_CHECKS } from './finding/ai-consistency-checks';
export {
  type FindingListFilter,
  type FindingPage,
  type FindingRepository,
} from './finding/finding-repository';
export {
  CONSISTENCY_SCAN_JOB_STEPS,
  ConsistencyScanService,
  type ConsistencyScanServiceDeps,
} from './finding/consistency-scan-service';
export { FindingService, type FindingServiceDeps } from './finding/finding-service';

export {
  MAX_REVIEW_TARGET_ANCHOR_LENGTH,
  REVIEW_TARGET_TYPES,
  requireReviewTarget,
  reviewTargetFilter,
  type ResolvedReviewTarget,
  type ReviewTarget,
  type ReviewTargetFilter,
  type ReviewTargetInput,
  type ReviewTargetType,
} from './review/review-target';
export { ReviewTargetResolver } from './review/review-target-resolver';
export {
  MAX_REVIEW_ACTOR_LENGTH,
  MAX_REVIEW_NOTE_LENGTH,
  REVIEW_STATES,
  createReviewDecision,
  isReviewJudgement,
  pinJudgement,
  resolveReviewState,
  type RecordReviewDecisionInput,
  type ReviewDecision,
  type ReviewState,
  type ReviewStatus,
} from './review/review-decision';
export { type ReviewDecisionRepository } from './review/review-decision-repository';
export {
  ReviewService,
  type NewReviewDecisionInput,
  type ReviewServiceDeps,
} from './review/review-service';
export {
  MAX_COMMENT_AUTHOR_LENGTH,
  MAX_COMMENT_BODY_LENGTH,
  applyCommentEdit,
  createComment,
  groupCommentThreads,
  reopenComment,
  resolveComment,
  type Comment,
  type CommentThread,
  type CreateCommentInput,
} from './review/comment';
export { type CommentRepository } from './review/comment-repository';
export {
  CommentService,
  type CommentServiceDeps,
  type EditCommentInput,
  type NewCommentInput,
  type NewReplyInput,
} from './review/comment-service';

export {
  ASSET_SELECTION_STATES,
  MAX_ASSET_SELECTION_ACTOR_LENGTH,
  MAX_ASSET_SELECTION_NOTE_LENGTH,
  MAX_ASSET_SELECTION_PURPOSE_LENGTH,
  createAssetSelection,
  currentAssetSelections,
  currentAssetSelectionsByPurpose,
  latestSelectionByAsset,
  requireAssetSelectionContext,
  sameAssetSelectionContext,
  type AssetSelection,
  type AssetSelectionContext,
  type AssetSelectionState,
  type AssetSelectionSummary,
  type CreateAssetSelectionInput,
} from './selection/asset-selection';
export { type AssetSelectionRepository } from './selection/asset-selection-repository';
export {
  ASSET_MARK_KINDS,
  MAX_ASSET_MARK_ACTOR_LENGTH,
  createAssetMark,
  type AssetMark,
  type AssetMarkKind,
  type CreateAssetMarkInput,
} from './selection/asset-mark';
export { type AssetMarkRepository } from './selection/asset-mark-repository';
export {
  AssetSelectionService,
  type ApproveAssetInput,
  type ApproveAssetResult,
  type AssetSelectionServiceDeps,
  type MarkAssetInput,
  type RejectAssetInput,
} from './selection/asset-selection-service';

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
export {
  formatMetricValue,
  metricDifferences,
  summarizeMetrics,
  type MetricSummary,
} from './compare/metric-differences';
