import { type Clock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { normalizeTags, optionalText, requireText } from '../shared/validation';

export const MAX_PLAYTEST_OBSERVATION_BODY_LENGTH = 10_000;
export const MAX_PLAYTEST_OBSERVATION_OBSERVED_BY_LENGTH = 200;

/**
 * A moment the team noticed during a playtest — their interpretation, not the
 * participant's own words. `docs/decisions/playtest-record-model.md` §8.3
 * keeps this apart from `PlaytestFeedback` because the authorship differs:
 * an observation is written by whoever was watching, feedback is what a
 * participant said.
 *
 * `entityId` narrows an observation to one thing in the game ("the diver got
 * stuck at the trench"). It cannot be an `EntityRelationship` because an
 * observation is not itself an entity (§9.2), so it is a single nullable
 * reference instead.
 */
export interface PlaytestObservation {
  id: string;
  projectId: string;
  playtestId: string;
  /** The run this was noticed in, or null for a whole-playtest note. */
  sessionId: string | null;
  entityId: string | null;
  /** Offset into the session, where one is known. */
  atSeconds: number | null;
  body: string;
  tags: string[];
  observedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlaytestObservationInput {
  projectId: string;
  playtestId: string;
  sessionId?: string | null;
  entityId?: string | null;
  atSeconds?: number | null;
  body: string;
  tags?: string[];
  observedBy?: string | null;
}

export interface PlaytestObservationFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createPlaytestObservation(
  input: CreatePlaytestObservationInput,
  deps: PlaytestObservationFactoryDeps,
): PlaytestObservation {
  const now = deps.clock.now();

  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    playtestId: requireText('playtestId', input.playtestId, 200),
    sessionId: optionalText('sessionId', input.sessionId, 200),
    entityId: optionalText('entityId', input.entityId, 200),
    atSeconds: optionalNonNegativeInt('atSeconds', input.atSeconds),
    body: requireText('body', input.body, MAX_PLAYTEST_OBSERVATION_BODY_LENGTH),
    tags: normalizeTags(input.tags),
    observedBy: optionalText(
      'observedBy',
      input.observedBy,
      MAX_PLAYTEST_OBSERVATION_OBSERVED_BY_LENGTH,
    ),
    createdAt: now,
    updatedAt: now,
  };
}

/** An offset in seconds: zero or more, and null unless one is known. */
function optionalNonNegativeInt(field: string, value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${field} must be a non-negative integer`, {
      field,
      received: value,
    });
  }
  return value;
}
