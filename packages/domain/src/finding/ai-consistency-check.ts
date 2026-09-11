import { type CheckFinding } from './finding';
import { type ProjectFacts } from './consistency-check';

/**
 * One entity retrieval proposed as worth looking at, and how close it was.
 *
 * A score is a proposal, never a proof: it says the index thinks two rows are
 * near each other in the vector space, which is exactly the claim a cosine can
 * support and no more. What the pair actually *means* is the judgement's job
 * (docs/decisions/consistency-findings.md §7.6).
 */
export interface AiCheckCandidate {
  entityId: string;
  /** Cosine similarity to the text that was searched for. Higher is closer. */
  score: number;
}

export interface AiRetrievalRequest {
  /** What to look for. Embedded with the same model that built the index. */
  text: string;
  /** The entity the text came from, so a row never proposes itself. */
  excludeEntityId?: string;
  limit?: number;
}

export interface AiJudgementRequest {
  /** The question, verbatim. It is stored as the `Generation`'s prompt. */
  prompt: string;
  /**
   * Every entity the judgement may weigh and cite. These become the
   * generation's `contextEntityIds` and its `resolvedContext`, which is what
   * makes "which objects entered context" answerable afterwards (§9).
   */
  contextEntityIds: readonly string[];
}

export interface AiJudgement {
  /** The `Generation` behind the answer, already completed. */
  generationId: string;
  /** What the model said, unparsed. */
  output: string;
}

/**
 * What an AI check is given beyond its facts: project-scoped retrieval, and
 * one way to ask a model.
 *
 * Bound to a single project by whoever constructs it, so a check has no more
 * ability to reach another project's material through here than it has
 * through `ProjectFacts` — the same structural scoping, extended to the two
 * calls a pure check cannot make for itself.
 */
export interface AiCheckContext {
  /** Semantic retrieval over the project's index, entities only. */
  retrieve(request: AiRetrievalRequest): Promise<AiCheckCandidate[]>;
  /**
   * Records, runs and closes one `text.generate` judgement.
   *
   * Throws if the provider does not answer, having recorded the failure on
   * the generation: a judgement that did not happen must not become a
   * finding.
   */
  judge(request: AiJudgementRequest): Promise<AiJudgement>;
}

/** What an AI check reports: findings, and the judgement that produced them. */
export interface AiCheckResult {
  /** The completed `Generation` every finding below is attributed to. */
  generationId: string;
  findings: CheckFinding[];
}

/**
 * An AI-assisted check: named, registered, and never mistakable for a proof.
 *
 * Deliberately a different type from `ConsistencyCheck` rather than the same
 * one with a flag (§6.4). `ConsistencyCheck.run` is synchronous and receives
 * no provider, so no implementation of it can make a model call; giving it a
 * provider to share one interface would dissolve exactly the guarantee the
 * separation exists for. Returning `null` is how a check says it had nothing
 * to judge — no candidates, so no generation and no findings.
 *
 * `origin` is not on this type at all: the runner sets it, so a check cannot
 * claim to be the other kind.
 */
export interface AiConsistencyCheck {
  /** Stable, kebab-case, and part of every fingerprint it mints. */
  id: string;
  /** Shown as the finding's category on the surface. */
  title: string;
  run(facts: ProjectFacts, ai: AiCheckContext): Promise<AiCheckResult | null>;
}
