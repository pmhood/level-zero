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
  optionalText,
  requireJsonObject,
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
  createEntity,
  restoreEntity,
  type CreateEntityInput,
  type Entity,
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
