import { type Asset } from '../asset/asset';
import { type AssetRepository } from '../asset/asset-repository';
import { type Entity } from '../entity/entity';
import { type EntityRepository } from '../entity/entity-repository';
import { type ProjectRepository } from '../project/project-repository';
import { type LineageService } from '../relationship/lineage-service';
import { type Clock } from '../shared/clock';
import { ConflictError, NotFoundError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { normalizePaging } from '../shared/paging';
import {
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
  type RedispatchGenerationInput,
} from './generation';
import {
  type GenerationListFilter,
  type GenerationPage,
  type GenerationRepository,
} from './generation-repository';

export interface GenerationServiceDeps {
  clock: Clock;
  ids: IdGenerator;
}

export type RecordGenerationInput = Omit<CreateGenerationInput, 'projectId'>;

export interface FinishGenerationInput extends CompleteGenerationInput {
  /**
   * Entities this generation produced or rewrote — usually the
   * `asset_reference` entity standing for an output asset. Each one gets
   * `generated_from` edges back to the generation's inputs and context.
   */
  outputEntityIds?: readonly string[];
}

/** A generation with every id it recorded resolved to the thing it names. */
export interface GenerationProvenance {
  generation: Generation;
  /** The generation this one refines or re-rolls, when there is one. */
  parent: Generation | null;
  inputEntities: Entity[];
  contextEntities: Entity[];
  inputAssets: Asset[];
  outputAssets: Asset[];
}

/**
 * Application service for AI generation records.
 *
 * The record is written *before* provider work is dispatched, so a generation
 * that never comes back is still visible and still explains what was asked for.
 * `dispatch`, `complete`, `fail` and `cancel` only ever move it forward; the
 * prompt, parameters and inputs are never rewritten, which is what lets a
 * failure keep its diagnostics without losing the original request.
 *
 * Outputs are ordinary `Asset` rows uploaded through `AssetService`, and the
 * creative lineage between entities stays in `EntityRelationship` — `complete`
 * writes `generated_from` edges through `LineageService` rather than growing a
 * second, parallel graph here.
 */
export class GenerationService {
  constructor(
    private readonly generations: GenerationRepository,
    private readonly projects: ProjectRepository,
    private readonly entities: EntityRepository,
    private readonly assets: AssetRepository,
    private readonly lineage: LineageService,
    private readonly deps: GenerationServiceDeps,
  ) {}

  /**
   * Records a generation before any provider is called.
   *
   * Every id it names is checked against the project first, so provenance
   * cannot quietly point at something from another project or at nothing.
   */
  async record(projectId: string, input: RecordGenerationInput): Promise<Generation> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (project.status === 'archived') {
      throw new ConflictError('Cannot record generations in an archived project', { projectId });
    }

    const generation = createGeneration({ ...input, projectId }, this.deps);

    if (generation.parentGenerationId) {
      await this.getById(projectId, generation.parentGenerationId);
    }
    await this.requireEntities(projectId, [
      ...generation.inputEntityIds,
      ...generation.contextEntityIds,
    ]);
    await this.requireAssets(projectId, generation.inputAssetIds);

    return this.generations.insert(generation);
  }

  /** Throws `NotFoundError` rather than returning null: callers want the record. */
  async getById(projectId: string, generationId: string): Promise<Generation> {
    const generation = await this.generations.findById(projectId, generationId);
    if (!generation) throw new NotFoundError('Generation', generationId);
    return generation;
  }

  async listByProject(
    projectId: string,
    filter: GenerationListFilter = {},
  ): Promise<GenerationPage> {
    const { limit, offset } = normalizePaging(filter.limit, filter.offset);
    return this.generations.listByProject(projectId, { ...filter, limit, offset });
  }

  /**
   * Everything needed to explain one output in a single call: the provider,
   * model, prompt and parameters, the entities and assets that went in, the
   * project context that influenced it, and the generation it came from.
   */
  async provenance(projectId: string, generationId: string): Promise<GenerationProvenance> {
    const generation = await this.getById(projectId, generationId);

    const [inputEntities, contextEntities, inputAssets, outputAssets] = await Promise.all([
      this.resolveEntities(projectId, generation.inputEntityIds),
      this.resolveEntities(projectId, generation.contextEntityIds),
      this.resolveAssets(projectId, generation.inputAssetIds),
      this.resolveAssets(projectId, generation.outputAssetIds),
    ]);

    return {
      generation,
      parent: generation.parentGenerationId
        ? await this.generations.findById(projectId, generation.parentGenerationId)
        : null,
      inputEntities,
      contextEntities,
      inputAssets,
      outputAssets,
    };
  }

  /** Records that provider work has started, and which provider and model are doing it. */
  async dispatch(
    projectId: string,
    generationId: string,
    input: DispatchGenerationInput,
  ): Promise<Generation> {
    const generation = await this.getById(projectId, generationId);
    return this.generations.save(dispatchGeneration(generation, input, this.deps));
  }

  /**
   * Corrects the provider and model on a generation already dispatched, for
   * when the candidate named at `dispatch` failed over to the next one.
   */
  async redispatch(
    projectId: string,
    generationId: string,
    input: RedispatchGenerationInput,
  ): Promise<Generation> {
    const generation = await this.getById(projectId, generationId);
    return this.generations.save(redispatchGeneration(generation, input));
  }

  /**
   * Attaches the output assets and closes the record.
   *
   * Lineage is written before the record is saved: an interrupted completion
   * then leaves edges that are still true rather than a finished generation
   * whose provenance is missing.
   */
  async complete(
    projectId: string,
    generationId: string,
    input: FinishGenerationInput,
  ): Promise<Generation> {
    const generation = await this.getById(projectId, generationId);
    const completed = completeGeneration(generation, input, this.deps);

    await this.requireAssets(projectId, completed.outputAssetIds);

    const sourceEntityIds = [...completed.inputEntityIds, ...completed.contextEntityIds];
    for (const outputEntityId of new Set(input.outputEntityIds ?? [])) {
      await this.lineage.recordGeneratedFrom(projectId, outputEntityId, sourceEntityIds, {
        generationId: completed.id,
      });
    }

    return this.generations.save(completed);
  }

  /** Keeps the request intact and records why the provider could not fulfil it. */
  async fail(
    projectId: string,
    generationId: string,
    input: FailGenerationInput,
  ): Promise<Generation> {
    const generation = await this.getById(projectId, generationId);
    return this.generations.save(failGeneration(generation, input, this.deps));
  }

  async cancel(projectId: string, generationId: string): Promise<Generation> {
    const generation = await this.getById(projectId, generationId);
    return this.generations.save(cancelGeneration(generation, this.deps));
  }

  private async requireEntities(projectId: string, entityIds: readonly string[]): Promise<void> {
    for (const entityId of entityIds) {
      const entity = await this.entities.findById(projectId, entityId);
      if (!entity) throw new NotFoundError('Entity', entityId);
    }
  }

  private async requireAssets(projectId: string, assetIds: readonly string[]): Promise<void> {
    for (const assetId of assetIds) {
      const asset = await this.assets.findById(projectId, assetId);
      if (!asset) throw new NotFoundError('Asset', assetId);
    }
  }

  /**
   * Resolves recorded ids for display. Anything no longer readable is dropped
   * rather than failing the lookup, so provenance survives a tidied project.
   */
  private async resolveEntities(
    projectId: string,
    entityIds: readonly string[],
  ): Promise<Entity[]> {
    const found = await Promise.all(
      entityIds.map((entityId) => this.entities.findById(projectId, entityId)),
    );
    return found.filter((entity): entity is Entity => entity !== null);
  }

  private async resolveAssets(projectId: string, assetIds: readonly string[]): Promise<Asset[]> {
    const found = await Promise.all(
      assetIds.map((assetId) => this.assets.findById(projectId, assetId)),
    );
    return found.filter((asset): asset is Asset => asset !== null);
  }
}
