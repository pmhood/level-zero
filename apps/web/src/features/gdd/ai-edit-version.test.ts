// @vitest-environment jsdom
import { MIN_AI_EDIT_VERSION_LENGTH } from '@level-zero/domain';
import { useEditorAutosave, type AcceptedAiEdit, type JSONContent } from '@level-zero/ui';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordAcceptedAiEdit } from './ai-edit-version';

function acceptedEdit(overrides: Partial<AcceptedAiEdit> = {}): AcceptedAiEdit {
  return {
    action: 'rewrite',
    label: 'Rewrite',
    instruction: 'Rewrite the passage so it reads better.',
    replaced: 'x'.repeat(MIN_AI_EDIT_VERSION_LENGTH),
    accepted: 'A rewritten core loop.',
    generationId: 'gen_1',
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe('recordAcceptedAiEdit', () => {
  it('brings the server up to date before taking the version of it', async () => {
    const order: string[] = [];
    const flush = vi.fn(async () => void order.push('flush'));
    const snapshot = vi.fn(async () => void order.push('snapshot'));

    await recordAcceptedAiEdit(acceptedEdit(), flush, snapshot);

    expect(order).toEqual(['flush', 'snapshot']);
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
    const flush = vi.fn(async () => undefined);
    const snapshot = vi.fn(async () => undefined);

    await recordAcceptedAiEdit(
      acceptedEdit({ replaced: 'Oxygen runs out.', accepted: 'The oxygen runs out fast.' }),
      flush,
      snapshot,
    );

    expect(flush).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('does not take a version when the body could not be saved', async () => {
    const snapshot = vi.fn(async () => undefined);
    const flush = vi.fn(async () => {
      throw new Error('API is down');
    });

    await expect(recordAcceptedAiEdit(acceptedEdit(), flush, snapshot)).rejects.toThrow(
      'API is down',
    );
    expect(snapshot).not.toHaveBeenCalled();
  });
});

const ACCEPTED: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A rewritten core loop.' }] }],
};

const TYPED: JSONContent = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'A rewritten core loop. And more.' }] },
  ],
};

/**
 * A server whose first write is the slow one, so a second writer racing it
 * would land first and be overwritten. Real networks reorder; this makes them.
 */
function reorderingServer() {
  const landed: JSONContent[] = [];
  let call = 0;

  const save = vi.fn(
    (content: JSONContent) =>
      new Promise<void>((resolve) => {
        const delay = call++ === 0 ? 500 : 50;
        setTimeout(() => {
          landed.push(content);
          resolve();
        }, delay);
      }),
  );

  return { save, landed };
}

/**
 * The composition `GddWorkspace` runs: one autosave, and an accepted AI edit
 * versioned by flushing it.
 *
 * This is the constraint the issue names — concurrent autosave and AI
 * acceptance must not lose unrelated document edits — and it only holds
 * because both writes go through the same queue.
 */
describe('accepting an AI edit while autosave is running', () => {
  it('leaves the server holding what the writer typed after accepting', async () => {
    vi.useFakeTimers();
    const server = reorderingServer();
    const snapshot = vi.fn(async () => undefined);
    const { result } = renderHook(() => useEditorAutosave(server.save, { delayMs: 100 }));

    // Accepting is an editor transaction: the new body reaches autosave first,
    // and only then does the accept handler run.
    act(() => result.current.onChange(ACCEPTED));
    let recorded!: Promise<void>;
    act(() => {
      recorded = recordAcceptedAiEdit(acceptedEdit(), result.current.flush, snapshot);
    });

    // The writer keeps working while the accepted body is still in flight.
    act(() => result.current.onChange(TYPED));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await recorded;

    expect(server.landed).toEqual([ACCEPTED, TYPED]);
    expect(snapshot).toHaveBeenCalledOnce();
  });

  it('takes the version once the accepted body has actually landed', async () => {
    vi.useFakeTimers();
    const server = reorderingServer();
    const order: string[] = [];
    const snapshot = vi.fn(async () => void order.push('snapshot'));
    const { result } = renderHook(() => useEditorAutosave(server.save, { delayMs: 100 }));

    act(() => result.current.onChange(ACCEPTED));
    let recorded!: Promise<void>;
    act(() => {
      recorded = recordAcceptedAiEdit(acceptedEdit(), result.current.flush, snapshot);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await recorded;

    expect(server.landed).toEqual([ACCEPTED]);
    expect(order).toEqual(['snapshot']);
  });
});
