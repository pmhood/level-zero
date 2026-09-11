import {
  type Activity,
  type Asset,
  type Comment,
  type Entity,
  type EntityRelationship,
  type EntityVersion,
  type Finding,
  type Generation,
  type Job,
  type MoodboardConnector,
  type MoodboardNode,
  type Playtest,
  type PlaytestFeedback,
  type PlaytestMetric,
  type PlaytestObservation,
  type PlaytestSession,
  type Project,
  type PrototypeVersion,
  type ReviewDecision,
  type ReviewTarget,
  type SearchDocument,
} from '@level-zero/domain';

import { type ActivityRow, type NewActivityRow } from '../schema/activities';
import { type AssetRow, type NewAssetRow } from '../schema/assets';
import { type GenerationRow, type NewGenerationRow } from '../schema/generations';
import { type EntityRow, type NewEntityRow } from '../schema/entities';
import {
  type EntityRelationshipRow,
  type NewEntityRelationshipRow,
} from '../schema/entity-relationships';
import { type EntityVersionRow, type NewEntityVersionRow } from '../schema/entity-versions';
import { type FindingRow, type NewFindingRow } from '../schema/findings';
import { type JobRow, type NewJobRow } from '../schema/jobs';
import {
  type MoodboardConnectorRow,
  type MoodboardNodeRow,
  type NewMoodboardConnectorRow,
  type NewMoodboardNodeRow,
} from '../schema/moodboards';
import {
  type NewPlaytestFeedbackRow,
  type NewPlaytestMetricRow,
  type NewPlaytestObservationRow,
  type NewPlaytestRow,
  type NewPlaytestSessionRow,
  type PlaytestFeedbackRow,
  type PlaytestMetricRow,
  type PlaytestObservationRow,
  type PlaytestRow,
  type PlaytestSessionRow,
} from '../schema/playtests';
import { type NewProjectRow, type ProjectRow } from '../schema/projects';
import {
  type CommentRow,
  type NewCommentRow,
  type NewReviewDecisionRow,
  type ReviewDecisionRow,
} from '../schema/reviews';
import { type NewSearchDocumentRow, type SearchDocumentRow } from '../schema/search-documents';
import {
  type NewPrototypeEntityVersionRow,
  type NewPrototypeVersionRow,
  type PrototypeEntityVersionRow,
  type PrototypeVersionRow,
} from '../schema/prototype-versions';

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

export function toProjectRow(project: Project): NewProjectRow {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archivedAt: project.archivedAt,
  };
}

export function toEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    name: row.name,
    description: row.description,
    status: row.status,
    tags: row.tags,
    data: row.data,
    currentVersionId: row.currentVersionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

export function toEntityRow(entity: Entity): NewEntityRow {
  return {
    id: entity.id,
    projectId: entity.projectId,
    type: entity.type,
    name: entity.name,
    description: entity.description,
    status: entity.status,
    tags: entity.tags,
    data: entity.data,
    currentVersionId: entity.currentVersionId,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    archivedAt: entity.archivedAt,
  };
}

export function toEntityRelationship(row: EntityRelationshipRow): EntityRelationship {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceEntityId: row.sourceEntityId,
    targetEntityId: row.targetEntityId,
    relation: row.relation,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toEntityRelationshipRow(
  relationship: EntityRelationship,
): NewEntityRelationshipRow {
  return {
    id: relationship.id,
    projectId: relationship.projectId,
    sourceEntityId: relationship.sourceEntityId,
    targetEntityId: relationship.targetEntityId,
    relation: relationship.relation,
    metadata: relationship.metadata,
    createdAt: relationship.createdAt,
    updatedAt: relationship.updatedAt,
  };
}

export function toEntityVersion(row: EntityVersionRow): EntityVersion {
  return {
    id: row.id,
    projectId: row.projectId,
    entityId: row.entityId,
    versionNumber: row.versionNumber,
    parentVersionId: row.parentVersionId,
    branchName: row.branchName,
    snapshot: row.snapshot,
    reason: row.reason,
    metadata: row.metadata,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export function toEntityVersionRow(version: EntityVersion): NewEntityVersionRow {
  return {
    id: version.id,
    projectId: version.projectId,
    entityId: version.entityId,
    versionNumber: version.versionNumber,
    parentVersionId: version.parentVersionId,
    branchName: version.branchName,
    snapshot: version.snapshot,
    reason: version.reason,
    metadata: version.metadata,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
  };
}

export function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    filename: row.filename,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    storageKey: row.storageKey,
    checksum: row.checksum,
    width: row.width,
    height: row.height,
    durationSeconds: row.durationSeconds,
    variant: row.variant,
    sourceAssetId: row.sourceAssetId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
    createdBy: row.createdBy,
  };
}

export function toAssetRow(asset: Asset): NewAssetRow {
  return {
    id: asset.id,
    projectId: asset.projectId,
    kind: asset.kind,
    filename: asset.filename,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    storageKey: asset.storageKey,
    checksum: asset.checksum,
    width: asset.width,
    height: asset.height,
    durationSeconds: asset.durationSeconds,
    variant: asset.variant,
    sourceAssetId: asset.sourceAssetId,
    status: asset.status,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    archivedAt: asset.archivedAt,
    createdBy: asset.createdBy,
  };
}

export function toGeneration(row: GenerationRow): Generation {
  return {
    id: row.id,
    projectId: row.projectId,
    capability: row.capability,
    provider: row.provider,
    model: row.model,
    prompt: row.prompt,
    parameters: row.parameters,
    status: row.status,
    inputEntityIds: row.inputEntityIds,
    inputAssetIds: row.inputAssetIds,
    contextEntityIds: row.contextEntityIds,
    resolvedContext: row.resolvedContext,
    outputAssetIds: row.outputAssetIds,
    parentGenerationId: row.parentGenerationId,
    seed: row.seed,
    providerRequestId: row.providerRequestId,
    failure: row.failure,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdBy: row.createdBy,
  };
}

export function toGenerationRow(generation: Generation): NewGenerationRow {
  return {
    id: generation.id,
    projectId: generation.projectId,
    capability: generation.capability,
    provider: generation.provider,
    model: generation.model,
    prompt: generation.prompt,
    parameters: generation.parameters,
    status: generation.status,
    inputEntityIds: generation.inputEntityIds,
    inputAssetIds: generation.inputAssetIds,
    contextEntityIds: generation.contextEntityIds,
    resolvedContext: generation.resolvedContext,
    outputAssetIds: generation.outputAssetIds,
    parentGenerationId: generation.parentGenerationId,
    seed: generation.seed,
    providerRequestId: generation.providerRequestId,
    failure: generation.failure,
    createdAt: generation.createdAt,
    startedAt: generation.startedAt,
    completedAt: generation.completedAt,
    createdBy: generation.createdBy,
  };
}

export function toJob(row: JobRow): Job {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    targetId: row.targetId,
    status: row.status,
    progress: {
      completed: row.progressCompleted,
      total: row.progressTotal,
      step: row.progressStep,
    },
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    failure: row.failure,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

export function toJobRow(job: Job): NewJobRow {
  return {
    id: job.id,
    projectId: job.projectId,
    kind: job.kind,
    targetId: job.targetId,
    status: job.status,
    progressCompleted: job.progress.completed,
    progressTotal: job.progress.total,
    progressStep: job.progress.step,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    failure: job.failure,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

/**
 * A prototype version is stored across two tables: the row itself and one
 * member row per pinned entity version, which the caller passes in already
 * ordered by `position`.
 */
export function toPrototypeVersion(
  row: PrototypeVersionRow,
  members: readonly PrototypeEntityVersionRow[],
): PrototypeVersion {
  return {
    id: row.id,
    projectId: row.projectId,
    prototypeId: row.prototypeId,
    versionNumber: row.versionNumber,
    name: row.name,
    status: row.status,
    notes: row.notes,
    buildAssetId: row.buildAssetId,
    members: members.map((member) => ({
      entityId: member.entityId,
      entityVersionId: member.entityVersionId,
    })),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPrototypeVersionRow(version: PrototypeVersion): NewPrototypeVersionRow {
  return {
    id: version.id,
    projectId: version.projectId,
    prototypeId: version.prototypeId,
    versionNumber: version.versionNumber,
    name: version.name,
    status: version.status,
    notes: version.notes,
    buildAssetId: version.buildAssetId,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  };
}

export function toPrototypeEntityVersionRows(
  version: PrototypeVersion,
): NewPrototypeEntityVersionRow[] {
  return version.members.map((member, position) => ({
    prototypeVersionId: version.id,
    projectId: version.projectId,
    entityId: member.entityId,
    entityVersionId: member.entityVersionId,
    position,
  }));
}

export function toMoodboardNode(row: MoodboardNodeRow): MoodboardNode {
  return {
    id: row.id,
    projectId: row.projectId,
    boardId: row.boardId,
    type: row.type,
    assetId: row.assetId,
    entityId: row.entityId,
    groupId: row.groupId,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    zOrder: row.zOrder,
    locked: row.locked,
    data: row.data,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toMoodboardNodeRow(node: MoodboardNode): NewMoodboardNodeRow {
  return {
    id: node.id,
    projectId: node.projectId,
    boardId: node.boardId,
    type: node.type,
    assetId: node.assetId,
    entityId: node.entityId,
    groupId: node.groupId,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    rotation: node.rotation,
    zOrder: node.zOrder,
    locked: node.locked,
    data: node.data,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

export function toMoodboardConnector(row: MoodboardConnectorRow): MoodboardConnector {
  return {
    id: row.id,
    projectId: row.projectId,
    boardId: row.boardId,
    fromNodeId: row.fromNodeId,
    toNodeId: row.toNodeId,
    label: row.label,
    relationshipId: row.relationshipId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toMoodboardConnectorRow(connector: MoodboardConnector): NewMoodboardConnectorRow {
  return {
    id: connector.id,
    projectId: connector.projectId,
    boardId: connector.boardId,
    fromNodeId: connector.fromNodeId,
    toNodeId: connector.toNodeId,
    label: connector.label,
    relationshipId: connector.relationshipId,
    createdAt: connector.createdAt,
    updatedAt: connector.updatedAt,
  };
}

export function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    summary: row.summary,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    metadata: row.metadata,
    actor: row.actor,
    createdAt: row.createdAt,
  };
}

export function toActivityRow(activity: Activity): NewActivityRow {
  return {
    id: activity.id,
    projectId: activity.projectId,
    type: activity.type,
    summary: activity.summary,
    subjectType: activity.subjectType,
    subjectId: activity.subjectId,
    metadata: activity.metadata,
    actor: activity.actor,
    createdAt: activity.createdAt,
  };
}

export function toSearchDocument(row: SearchDocumentRow): SearchDocument {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    entityType: row.entityType,
    status: row.status,
    tags: row.tags,
    title: row.title,
    body: row.body,
    contentHash: row.contentHash,
    embedding: row.embedding,
    embeddingModel: row.embeddingModel,
    embeddedHash: row.embeddedHash,
    sourceVersionId: row.sourceVersionId,
    sourceUpdatedAt: row.sourceUpdatedAt,
    indexedAt: row.indexedAt,
  };
}

export function toSearchDocumentRow(document: SearchDocument): NewSearchDocumentRow {
  return {
    id: document.id,
    projectId: document.projectId,
    sourceType: document.sourceType,
    sourceId: document.sourceId,
    entityType: document.entityType,
    status: document.status,
    tags: document.tags,
    title: document.title,
    body: document.body,
    contentHash: document.contentHash,
    embedding: document.embedding,
    embeddingModel: document.embeddingModel,
    embeddedHash: document.embeddedHash,
    sourceVersionId: document.sourceVersionId,
    sourceUpdatedAt: document.sourceUpdatedAt,
    indexedAt: document.indexedAt,
  };
}

export function toPlaytest(row: PlaytestRow): Playtest {
  return {
    id: row.id,
    projectId: row.projectId,
    prototypeVersionId: row.prototypeVersionId,
    name: row.name,
    goal: row.goal,
    status: row.status,
    summary: row.summary,
    tags: row.tags,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPlaytestRow(playtest: Playtest): NewPlaytestRow {
  return {
    id: playtest.id,
    projectId: playtest.projectId,
    prototypeVersionId: playtest.prototypeVersionId,
    name: playtest.name,
    goal: playtest.goal,
    status: playtest.status,
    summary: playtest.summary,
    tags: playtest.tags,
    createdBy: playtest.createdBy,
    createdAt: playtest.createdAt,
    updatedAt: playtest.updatedAt,
  };
}

export function toPlaytestSession(row: PlaytestSessionRow): PlaytestSession {
  return {
    id: row.id,
    projectId: row.projectId,
    playtestId: row.playtestId,
    sessionNumber: row.sessionNumber,
    participant: row.participant,
    notes: row.notes,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPlaytestSessionRow(session: PlaytestSession): NewPlaytestSessionRow {
  return {
    id: session.id,
    projectId: session.projectId,
    playtestId: session.playtestId,
    sessionNumber: session.sessionNumber,
    participant: session.participant,
    notes: session.notes,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export function toPlaytestObservation(row: PlaytestObservationRow): PlaytestObservation {
  return {
    id: row.id,
    projectId: row.projectId,
    playtestId: row.playtestId,
    sessionId: row.sessionId,
    entityId: row.entityId,
    atSeconds: row.atSeconds,
    body: row.body,
    tags: row.tags,
    observedBy: row.observedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPlaytestObservationRow(
  observation: PlaytestObservation,
): NewPlaytestObservationRow {
  return {
    id: observation.id,
    projectId: observation.projectId,
    playtestId: observation.playtestId,
    sessionId: observation.sessionId,
    entityId: observation.entityId,
    atSeconds: observation.atSeconds,
    body: observation.body,
    tags: observation.tags,
    observedBy: observation.observedBy,
    createdAt: observation.createdAt,
    updatedAt: observation.updatedAt,
  };
}

export function toPlaytestFeedback(row: PlaytestFeedbackRow): PlaytestFeedback {
  return {
    id: row.id,
    projectId: row.projectId,
    playtestId: row.playtestId,
    sessionId: row.sessionId,
    body: row.body,
    sentiment: row.sentiment,
    tags: row.tags,
    author: row.author,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPlaytestFeedbackRow(feedback: PlaytestFeedback): NewPlaytestFeedbackRow {
  return {
    id: feedback.id,
    projectId: feedback.projectId,
    playtestId: feedback.playtestId,
    sessionId: feedback.sessionId,
    body: feedback.body,
    sentiment: feedback.sentiment,
    tags: feedback.tags,
    author: feedback.author,
    createdAt: feedback.createdAt,
    updatedAt: feedback.updatedAt,
  };
}

export function toPlaytestMetric(row: PlaytestMetricRow): PlaytestMetric {
  return {
    id: row.id,
    projectId: row.projectId,
    playtestId: row.playtestId,
    sessionId: row.sessionId,
    metricKey: row.metricKey,
    label: row.label,
    value: row.value,
    unit: row.unit,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPlaytestMetricRow(metric: PlaytestMetric): NewPlaytestMetricRow {
  return {
    id: metric.id,
    projectId: metric.projectId,
    playtestId: metric.playtestId,
    sessionId: metric.sessionId,
    metricKey: metric.metricKey,
    label: metric.label,
    value: metric.value,
    unit: metric.unit,
    createdAt: metric.createdAt,
    updatedAt: metric.updatedAt,
  };
}

export function toFinding(row: FindingRow): Finding {
  return {
    id: row.id,
    projectId: row.projectId,
    checkId: row.checkId,
    fingerprint: row.fingerprint,
    origin: row.origin,
    generationId: row.generationId,
    severity: row.severity,
    summary: row.summary,
    evidence: row.evidence,
    status: row.status,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    resolvedAt: row.resolvedAt,
    dismissedAt: row.dismissedAt,
    dismissedBy: row.dismissedBy,
    dismissedReason: row.dismissedReason,
  };
}

export function toFindingRow(finding: Finding): NewFindingRow {
  return {
    id: finding.id,
    projectId: finding.projectId,
    checkId: finding.checkId,
    fingerprint: finding.fingerprint,
    origin: finding.origin,
    generationId: finding.generationId,
    severity: finding.severity,
    summary: finding.summary,
    evidence: finding.evidence,
    status: finding.status,
    firstSeenAt: finding.firstSeenAt,
    lastSeenAt: finding.lastSeenAt,
    resolvedAt: finding.resolvedAt,
    dismissedAt: finding.dismissedAt,
    dismissedBy: finding.dismissedBy,
    dismissedReason: finding.dismissedReason,
  };
}

export function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    projectId: row.projectId,
    target: toReviewTarget(row),
    parentCommentId: row.parentCommentId,
    author: row.author,
    body: row.body,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toCommentRow(comment: Comment): NewCommentRow {
  return {
    id: comment.id,
    projectId: comment.projectId,
    targetType: comment.target.type,
    targetId: comment.target.id,
    targetAnchor: comment.target.anchor,
    versionId: comment.target.versionId,
    parentCommentId: comment.parentCommentId,
    author: comment.author,
    body: comment.body,
    resolvedAt: comment.resolvedAt,
    resolvedBy: comment.resolvedBy,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

export function toReviewDecision(row: ReviewDecisionRow): ReviewDecision {
  return {
    id: row.id,
    projectId: row.projectId,
    target: toReviewTarget(row),
    state: row.state,
    actor: row.actor,
    note: row.note,
    decidedAt: row.decidedAt,
  };
}

export function toReviewDecisionRow(decision: ReviewDecision): NewReviewDecisionRow {
  return {
    id: decision.id,
    projectId: decision.projectId,
    targetType: decision.target.type,
    targetId: decision.target.id,
    targetAnchor: decision.target.anchor,
    versionId: decision.target.versionId,
    state: decision.state,
    actor: decision.actor,
    note: decision.note,
    decidedAt: decision.decidedAt,
  };
}

/** The four columns both review tables spell the target with. */
function toReviewTarget(row: CommentRow | ReviewDecisionRow): ReviewTarget {
  return {
    type: row.targetType,
    id: row.targetId,
    anchor: row.targetAnchor,
    versionId: row.versionId,
  };
}

/**
 * Escapes the wildcards Postgres `LIKE` understands so a user searching for
 * "100%" does not accidentally match everything.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}
