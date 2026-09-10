import { type Clock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { optionalText, requireText } from '../shared/validation';

export const MAX_MOODBOARD_CONNECTOR_LABEL_LENGTH = 200;

/**
 * A line drawn between two nodes on a board.
 *
 * A connector is an annotation on one board, not a claim about the project. It
 * becomes an `EntityRelationship` only when someone promotes it — see
 * `MoodboardService.promoteConnector` — and `relationshipId` records that they
 * did. Drawing, moving and deleting connectors never touches the project graph.
 */
export interface MoodboardConnector {
  id: string;
  projectId: string;
  boardId: string;
  fromNodeId: string;
  toNodeId: string;
  /** What the line means, in the author's words. */
  label: string | null;
  /** The edge this connector was promoted into, or null while it is just a line. */
  relationshipId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMoodboardConnectorInput {
  projectId: string;
  boardId: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string | null;
}

export interface MoodboardConnectorFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createMoodboardConnector(
  input: CreateMoodboardConnectorInput,
  deps: MoodboardConnectorFactoryDeps,
): MoodboardConnector {
  const fromNodeId = requireText('fromNodeId', input.fromNodeId, 200);
  const toNodeId = requireText('toNodeId', input.toNodeId, 200);

  if (fromNodeId === toNodeId) {
    throw new ValidationError('A connector must join two different nodes', { fromNodeId });
  }

  const now = deps.clock.now();
  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    boardId: requireText('boardId', input.boardId, 200),
    fromNodeId,
    toNodeId,
    label: optionalText('label', input.label, MAX_MOODBOARD_CONNECTOR_LABEL_LENGTH),
    relationshipId: null,
    createdAt: now,
    updatedAt: now,
  };
}
