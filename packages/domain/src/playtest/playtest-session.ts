import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import { optionalText, requireText } from '../shared/validation';

export const MAX_PLAYTEST_SESSION_PARTICIPANT_LENGTH = 200;
export const MAX_PLAYTEST_SESSION_NOTES_LENGTH = 10_000;

/**
 * One concrete run within a playtest.
 *
 * `docs/decisions/playtest-record-model.md` §3.2: it has no life outside its
 * parent playtest, no name worth searching on its own, and nothing to
 * version, so it is a plain child row rather than an annotated one.
 * `sessionNumber` is monotonic within the playtest, minted the same way
 * `PrototypeVersion.versionNumber` is — the service reads the current
 * high-water mark and adds one, and a `unique(playtest_id, session_number)`
 * constraint catches the race.
 */
export interface PlaytestSession {
  id: string;
  projectId: string;
  playtestId: string;
  sessionNumber: number;
  /** A participant is not a user account, so this is free text. */
  participant: string | null;
  notes: string | null;
  /** Both nullable: a session may be logged after the fact. */
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlaytestSessionInput {
  projectId: string;
  playtestId: string;
  sessionNumber: number;
  participant?: string | null;
  notes?: string | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
}

export interface PlaytestSessionFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createPlaytestSession(
  input: CreatePlaytestSessionInput,
  deps: PlaytestSessionFactoryDeps,
): PlaytestSession {
  const now = deps.clock.now();

  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    playtestId: requireText('playtestId', input.playtestId, 200),
    sessionNumber: input.sessionNumber,
    participant: optionalText(
      'participant',
      input.participant,
      MAX_PLAYTEST_SESSION_PARTICIPANT_LENGTH,
    ),
    notes: optionalText('notes', input.notes, MAX_PLAYTEST_SESSION_NOTES_LENGTH),
    startedAt: input.startedAt ?? null,
    endedAt: input.endedAt ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
