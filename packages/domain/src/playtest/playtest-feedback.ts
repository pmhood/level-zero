import { type Clock } from '../shared/clock';
import { type IdGenerator } from '../shared/id';
import { normalizeTags, optionalText, requireOneOf, requireText } from '../shared/validation';

/** A three-way judgment, not a vocabulary — kept small on purpose (§8.3). */
export const PLAYTEST_SENTIMENTS = ['positive', 'neutral', 'negative'] as const;
export type PlaytestSentiment = (typeof PLAYTEST_SENTIMENTS)[number];

export const MAX_PLAYTEST_FEEDBACK_BODY_LENGTH = 10_000;
export const MAX_PLAYTEST_FEEDBACK_AUTHOR_LENGTH = 200;

/**
 * A participant's own words, stored verbatim — not the team's interpretation
 * of what happened (that is `PlaytestObservation`; §8.3 keeps the two apart
 * because their authorship differs, not because they look alike).
 *
 * Unlike an observation, feedback has no `entityId`: #63 describes it as
 * participant prose grouped by theme, not by the entity it concerns.
 */
export interface PlaytestFeedback {
  id: string;
  projectId: string;
  playtestId: string;
  /** The run this was said in, or null for a whole-playtest remark. */
  sessionId: string | null;
  body: string;
  sentiment: PlaytestSentiment | null;
  tags: string[];
  /** Who said it, where known. */
  author: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlaytestFeedbackInput {
  projectId: string;
  playtestId: string;
  sessionId?: string | null;
  body: string;
  sentiment?: PlaytestSentiment | null;
  tags?: string[];
  author?: string | null;
}

export interface PlaytestFeedbackFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createPlaytestFeedback(
  input: CreatePlaytestFeedbackInput,
  deps: PlaytestFeedbackFactoryDeps,
): PlaytestFeedback {
  const now = deps.clock.now();

  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    playtestId: requireText('playtestId', input.playtestId, 200),
    sessionId: optionalText('sessionId', input.sessionId, 200),
    body: requireText('body', input.body, MAX_PLAYTEST_FEEDBACK_BODY_LENGTH),
    sentiment:
      input.sentiment === undefined || input.sentiment === null
        ? null
        : requireOneOf('sentiment', input.sentiment, PLAYTEST_SENTIMENTS),
    tags: normalizeTags(input.tags),
    author: optionalText('author', input.author, MAX_PLAYTEST_FEEDBACK_AUTHOR_LENGTH),
    createdAt: now,
    updatedAt: now,
  };
}
