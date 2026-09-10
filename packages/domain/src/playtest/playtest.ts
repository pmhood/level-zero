import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import { normalizeTags, optionalText, requireOneOf, requireText } from '../shared/validation';

/**
 * How far along a playtest is.
 *
 * Mirrors `GENERATION_STATUSES`' vocabulary for a thing that happens over
 * time: `planned` before it runs, `running` while sessions are being
 * captured, and `complete` or `cancelled` once nothing more will be recorded
 * against it.
 */
export const PLAYTEST_STATUSES = ['planned', 'running', 'complete', 'cancelled'] as const;
export type PlaytestStatus = (typeof PLAYTEST_STATUSES)[number];

export const MAX_PLAYTEST_NAME_LENGTH = 200;
export const MAX_PLAYTEST_GOAL_LENGTH = 2_000;
export const MAX_PLAYTEST_SUMMARY_LENGTH = 10_000;
export const MAX_PLAYTEST_CREATED_BY_LENGTH = 200;

/**
 * Evidence about one exact `PrototypeVersion`, not a game object.
 *
 * `docs/decisions/playtest-record-model.md` §3.1 is why this is a table
 * rather than an `Entity`: versioning a playtest is meaningless, and its
 * hardest field — the version it tested — cannot live in schemaless `data`.
 * `prototypeVersionId` is the pin §5 builds a database guarantee around: a
 * playtest can only ever name a version from its own project, and that
 * version cannot be deleted while a playtest cites it. There is no
 * `prototypeId` (§5.3) — it is derivable through the version, and duplicating
 * it would duplicate entity identity.
 *
 * `goal` and `summary` are short plain text, not `RichTextEditor` content: a
 * long-form write-up is its own `document` entity (§9.1), and nothing here
 * substitutes for it.
 */
export interface Playtest {
  id: string;
  projectId: string;
  prototypeVersionId: string;
  name: string;
  goal: string | null;
  status: PlaytestStatus;
  summary: string | null;
  /** Free-form categories: usability, difficulty, pacing, ... (§6). */
  tags: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlaytestInput {
  projectId: string;
  prototypeVersionId: string;
  name: string;
  goal?: string | null;
  status?: PlaytestStatus;
  summary?: string | null;
  tags?: string[];
  createdBy?: string | null;
}

export interface PlaytestFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createPlaytest(input: CreatePlaytestInput, deps: PlaytestFactoryDeps): Playtest {
  const now = deps.clock.now();

  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    prototypeVersionId: requireText('prototypeVersionId', input.prototypeVersionId, 200),
    name: requireText('name', input.name, MAX_PLAYTEST_NAME_LENGTH),
    goal: optionalText('goal', input.goal, MAX_PLAYTEST_GOAL_LENGTH),
    status: requireOneOf('status', input.status ?? 'planned', PLAYTEST_STATUSES),
    summary: optionalText('summary', input.summary, MAX_PLAYTEST_SUMMARY_LENGTH),
    tags: normalizeTags(input.tags),
    createdBy: optionalText('createdBy', input.createdBy, MAX_PLAYTEST_CREATED_BY_LENGTH),
    createdAt: now,
    updatedAt: now,
  };
}

export interface UpdatePlaytestInput {
  name?: string;
  goal?: string | null;
  status?: PlaytestStatus;
  summary?: string | null;
  tags?: string[];
}

/** Returns a new playtest with the given fields changed; the input is never mutated. */
export function applyPlaytestUpdate(
  playtest: Playtest,
  patch: UpdatePlaytestInput,
  deps: { clock: Clock },
): Playtest {
  const next: Playtest = { ...playtest };

  if (patch.name !== undefined) {
    next.name = requireText('name', patch.name, MAX_PLAYTEST_NAME_LENGTH);
  }
  if (patch.goal !== undefined) {
    next.goal = optionalText('goal', patch.goal, MAX_PLAYTEST_GOAL_LENGTH);
  }
  if (patch.status !== undefined) {
    next.status = requireOneOf('status', patch.status, PLAYTEST_STATUSES);
  }
  if (patch.summary !== undefined) {
    next.summary = optionalText('summary', patch.summary, MAX_PLAYTEST_SUMMARY_LENGTH);
  }
  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);

  next.updatedAt = deps.clock.now();
  return next;
}
