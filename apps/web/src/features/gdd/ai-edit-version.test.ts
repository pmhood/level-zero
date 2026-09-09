import { MIN_AI_EDIT_VERSION_LENGTH } from '@level-zero/domain';
import type { AcceptedAiEdit } from '@level-zero/ui';
import { describe, expect, it, vi } from 'vitest';

import { recordAcceptedAiEdit } from './ai-edit-version';

const CONTENT = { type: 'doc', content: [{ type: 'paragraph' }] };

function acceptedEdit(overrides: Partial<AcceptedAiEdit> = {}): AcceptedAiEdit {
  return {
    action: 'rewrite',
    label: 'Rewrite',
    instruction: 'Rewrite the passage so it reads better.',
    replaced: 'x'.repeat(MIN_AI_EDIT_VERSION_LENGTH),
    accepted: 'A rewritten core loop.',
    generationId: 'gen_1',
    content: CONTENT,
    ...overrides,
  };
}

describe('recordAcceptedAiEdit', () => {
  it('saves the accepted body before taking the version of it', async () => {
    const order: string[] = [];
    const save = vi.fn(async () => void order.push('save'));
    const snapshot = vi.fn(async () => void order.push('snapshot'));

    await recordAcceptedAiEdit(acceptedEdit(), save, snapshot);

    expect(order).toEqual(['save', 'snapshot']);
    expect(save).toHaveBeenCalledExactlyOnceWith(CONTENT);
  });

  it('names the version after the action and points it at the generation', async () => {
    const snapshot = vi.fn(async () => undefined);

    await recordAcceptedAiEdit(
      acceptedEdit({ label: 'Make it concise' }),
      async () => undefined,
      snapshot,
    );

    expect(snapshot).toHaveBeenCalledExactlyOnceWith({
      reason: 'ai_edit',
      name: 'AI edit — Make it concise',
      generationId: 'gen_1',
    });
  });

  it('leaves a tweak to autosave, so accepting a dozen of them is not a dozen versions', async () => {
    const save = vi.fn(async () => undefined);
    const snapshot = vi.fn(async () => undefined);

    await recordAcceptedAiEdit(
      acceptedEdit({ replaced: 'Oxygen runs out.', accepted: 'The oxygen runs out fast.' }),
      save,
      snapshot,
    );

    expect(save).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('does not take a version when the body could not be saved', async () => {
    const snapshot = vi.fn(async () => undefined);
    const save = vi.fn(async () => {
      throw new Error('API is down');
    });

    await expect(recordAcceptedAiEdit(acceptedEdit(), save, snapshot)).rejects.toThrow(
      'API is down',
    );
    expect(snapshot).not.toHaveBeenCalled();
  });
});
