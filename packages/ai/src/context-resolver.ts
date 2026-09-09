import {
  NotFoundError,
  documentContent,
  type Asset,
  type AssetRepository,
  type DocumentContent,
  type Entity,
  type EntityRelationship,
  type EntityRelationshipRepository,
  type EntityRepository,
  type GenerationRepository,
  type ProjectRepository,
} from '@level-zero/domain';

import {
  DEFAULT_CONTEXT_DEPTH,
  DEFAULT_MAX_CONTEXT_ENTITIES,
  MAX_CONTEXT_DEPTH,
  MAX_CONTEXT_ENTITIES,
  MAX_CONTEXT_SECTION_LENGTH,
  type ContextAsset,
  type ContextDocumentSection,
  type ContextEntity,
  type ContextLineage,
  type ContextRequest,
  type ContextSource,
  type ResolvedContext,
} from './context';

/**
 * Assembles the project material behind one AI request.
 *
 * A feature says what the user pointed at — a selection, an `@mention`, a
 * reference image, the generation being re-rolled — and this walks outwards
 * from there through the relationship graph, so a prompt about a character
 * arrives carrying the faction, the location and the mechanic it is actually
 * connected to.
 *
 * Everything is read through project-scoped ports, so a context can only ever
 * contain one project's material. The ids the user named must exist; the
 * entities the walk discovers are best effort, and archived ones are left out
 * because they are no longer part of the current creative picture.
 */
export class ContextResolver {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly entities: EntityRepository,
    private readonly relationships: EntityRelationshipRepository,
    private readonly assets: AssetRepository,
    private readonly generations: GenerationRepository,
  ) {}

  async resolve(projectId: string, request: ContextRequest): Promise<ResolvedContext> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);

    const named = await this.resolveNamed(projectId, request);
    const maxEntities = clamp(
      request.maxEntities ?? DEFAULT_MAX_CONTEXT_ENTITIES,
      0,
      MAX_CONTEXT_ENTITIES,
    );
    const truncated = await this.expand(projectId, request, named, maxEntities);

    return {
      project: { id: project.id, name: project.name, description: project.description },
      instruction: request.instruction,
      entities: [...named.values()],
      assets: await this.resolveAssets(projectId, request.assetIds ?? []),
      lineage: await this.resolveLineage(projectId, request.parentGenerationId),
      truncated,
    };
  }

  /**
   * The entities the user pointed at. An entity pointed at twice keeps the
   * first reason it was named, which is why the selection is added first.
   */
  private async resolveNamed(
    projectId: string,
    request: ContextRequest,
  ): Promise<Map<string, ContextEntity>> {
    const included = new Map<string, ContextEntity>();
    await this.addNamed(projectId, included, request.selectedEntityIds ?? [], 'selected');
    await this.addNamed(projectId, included, request.mentionedEntityIds ?? [], 'mention');
    return included;
  }

  /** These must exist: the user named them. */
  private async addNamed(
    projectId: string,
    included: Map<string, ContextEntity>,
    entityIds: readonly string[],
    source: ContextSource,
  ): Promise<void> {
    for (const entityId of entityIds) {
      if (included.has(entityId)) continue;

      const entity = await this.entities.findById(projectId, entityId);
      if (!entity) throw new NotFoundError('Entity', entityId);
      included.set(entityId, toContextEntity(entity, { source, distance: 0 }));
    }
  }

  /**
   * Walks the relationship graph outwards, breadth first, until the requested
   * depth or the entity ceiling is reached. Returns whether the ceiling stopped
   * it early, which is what tells a caller the context is a sample rather than
   * the whole neighbourhood.
   */
  private async expand(
    projectId: string,
    request: ContextRequest,
    included: Map<string, ContextEntity>,
    maxEntities: number,
  ): Promise<boolean> {
    const depth = clamp(request.relatedDepth ?? DEFAULT_CONTEXT_DEPTH, 0, MAX_CONTEXT_DEPTH);
    let frontier = [...included.keys()];

    for (let distance = 1; distance <= depth && frontier.length > 0; distance += 1) {
      const next: string[] = [];

      for (const entityId of frontier) {
        const { items } = await this.relationships.listForEntity(projectId, entityId, {
          direction: 'both',
          relations: request.relations,
          limit: maxEntities,
        });

        for (const edge of items) {
          const neighborId = otherEnd(edge, entityId);
          if (included.has(neighborId)) continue;
          if (included.size >= maxEntities) return true;

          const neighbor = await this.entities.findById(projectId, neighborId);
          // Archived entities are history, not current creative material.
          if (!neighbor || neighbor.status === 'archived') continue;

          included.set(
            neighborId,
            toContextEntity(neighbor, {
              source: 'related',
              distance,
              relation: edge.relation,
              viaEntityId: entityId,
            }),
          );
          next.push(neighborId);
        }
      }

      frontier = next;
    }

    return false;
  }

  private async resolveAssets(
    projectId: string,
    assetIds: readonly string[],
  ): Promise<ContextAsset[]> {
    const resolved: ContextAsset[] = [];

    for (const assetId of new Set(assetIds)) {
      const asset = await this.assets.findById(projectId, assetId);
      if (!asset) throw new NotFoundError('Asset', assetId);
      resolved.push(toContextAsset(asset));
    }

    return resolved;
  }

  private async resolveLineage(
    projectId: string,
    parentGenerationId: string | undefined,
  ): Promise<ContextLineage | null> {
    if (!parentGenerationId) return null;

    const parent = await this.generations.findById(projectId, parentGenerationId);
    if (!parent) throw new NotFoundError('Generation', parentGenerationId);

    return {
      generationId: parent.id,
      capability: parent.capability,
      provider: parent.provider,
      model: parent.model,
      prompt: parent.prompt,
      outputAssetIds: [...parent.outputAssetIds],
    };
  }
}

interface ContextEntityOrigin {
  source: ContextSource;
  distance: number;
  relation?: ContextEntity['relation'];
  viaEntityId?: string;
}

function toContextEntity(entity: Entity, origin: ContextEntityOrigin): ContextEntity {
  return {
    id: entity.id,
    type: entity.type,
    name: entity.name,
    description: entity.description,
    status: entity.status,
    tags: [...entity.tags],
    source: origin.source,
    distance: origin.distance,
    relation: origin.relation ?? null,
    viaEntityId: origin.viaEntityId ?? null,
    ...(entity.type === 'document' ? { sections: documentSections(documentContent(entity)) } : {}),
  };
}

function toContextAsset(asset: Asset): ContextAsset {
  return {
    id: asset.id,
    kind: asset.kind,
    filename: asset.filename,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    source: 'reference',
  };
}

/**
 * Splits a document body into the sections its headings already imply, so the
 * part of a GDD that went into a prompt can be named rather than guessed at.
 * Anything before the first heading is one unnamed section.
 */
function documentSections(content: DocumentContent): ContextDocumentSection[] {
  const sections: ContextDocumentSection[] = [];
  let current: ContextDocumentSection = { heading: '', text: '' };

  for (const node of Array.isArray(content.content) ? content.content : []) {
    const text = nodeText(node);

    if (isHeading(node)) {
      if (current.heading || current.text) sections.push(current);
      current = { heading: text, text: '' };
      continue;
    }

    if (text) current.text = current.text ? `${current.text}\n${text}` : text;
  }

  if (current.heading || current.text) sections.push(current);

  return sections.map((section) => ({
    heading: section.heading,
    text: section.text.slice(0, MAX_CONTEXT_SECTION_LENGTH),
  }));
}

function isHeading(node: unknown): boolean {
  return (
    typeof node === 'object' && node !== null && (node as { type?: unknown }).type === 'heading'
  );
}

/** Concatenates every `text` leaf under a node, whatever custom nodes wrap it. */
function nodeText(node: unknown): string {
  if (typeof node !== 'object' || node === null) return '';

  const { text, content } = node as { text?: unknown; content?: unknown };
  if (typeof text === 'string') return text;
  if (!Array.isArray(content)) return '';

  return content
    .map(nodeText)
    .filter((part) => part.length > 0)
    .join(' ');
}

function otherEnd(edge: EntityRelationship, entityId: string): string {
  return edge.sourceEntityId === entityId ? edge.targetEntityId : edge.sourceEntityId;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}
