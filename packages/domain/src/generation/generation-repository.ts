import { type Generation, type GenerationStatus } from './generation';

export interface GenerationListFilter {
  statuses?: readonly GenerationStatus[];
  /** Exact capability, e.g. `image.generate`. */
  capability?: string;
  /** Re-rolls and refinements of one generation. */
  parentGenerationId?: string;
  /** The generation that produced this asset — provenance, read from the output. */
  outputAssetId?: string;
  /** Generations that used this entity, as a named input or as project context. */
  entityId?: string;
  limit?: number;
  offset?: number;
}

export interface GenerationPage {
  items: Generation[];
  /** Total matching rows, ignoring `limit`/`offset`. */
  total: number;
}

/**
 * Storage port for generation records.
 *
 * There is no delete: a generation is how an output came to exist, so it is
 * kept for as long as the project is. Every read is scoped by `projectId`, the
 * same as every other repository here.
 */
export interface GenerationRepository {
  insert(generation: Generation): Promise<Generation>;
  findById(projectId: string, generationId: string): Promise<Generation | null>;
  listByProject(projectId: string, filter: GenerationListFilter): Promise<GenerationPage>;
  save(generation: Generation): Promise<Generation>;
}
