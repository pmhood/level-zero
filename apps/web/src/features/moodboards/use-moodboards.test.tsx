// @vitest-environment jsdom
import type { MoodboardNode } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useRestoreMoodboardNodes } from './use-moodboards';

vi.mock('@/lib/api', () => ({
  addMoodboardNode: vi.fn(),
}));

const api = await import('@/lib/api');

/**
 * `MoodboardCanvas`'s own tests exercise the restore path against a mocked
 * `actions.restoreNodes`, which cannot duplicate an Asset or Entity by
 * construction — it never calls anything that creates one. This file tests
 * the real seam instead: what `useRestoreMoodboardNodes` actually hands
 * `api.addMoodboardNode`, which is where a bug that re-pointed at a new
 * reference, rather than the original one, would actually show up.
 */
function node(overrides: Partial<MoodboardNode> = {}): MoodboardNode {
  return {
    id: 'node_1',
    projectId: 'prj_1',
    boardId: 'board_1',
    type: 'asset',
    assetId: 'asset_99',
    entityId: null,
    groupId: null,
    x: 10,
    y: 20,
    width: 200,
    height: 150,
    rotation: 0,
    zOrder: 3,
    locked: true,
    data: {},
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    updatedAt: new Date('2026-03-01T09:00:00.000Z'),
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useRestoreMoodboardNodes', () => {
  it('re-adds a removed asset placement pointing at the same asset, never a new one', async () => {
    vi.mocked(api.addMoodboardNode).mockResolvedValue(node({ id: 'node_restored' }));
    const { result } = renderHook(() => useRestoreMoodboardNodes('prj_1', 'board_1'), { wrapper });

    await result.current.mutateAsync([
      node({ type: 'asset', assetId: 'asset_99', entityId: null }),
    ]);

    expect(api.addMoodboardNode).toHaveBeenCalledTimes(1);
    const [projectId, boardId, payload] = vi.mocked(api.addMoodboardNode).mock.calls[0]!;
    expect(projectId).toBe('prj_1');
    expect(boardId).toBe('board_1');
    expect(payload).toMatchObject({ type: 'asset', assetId: 'asset_99' });
    // Never both — sending an entityId alongside an assetId is exactly what
    // would let a restore claim a second kind of reference for the same node.
    expect(payload).not.toHaveProperty('entityId');
  });

  it('re-adds a removed entity placement pointing at the same entity, never a new one', async () => {
    vi.mocked(api.addMoodboardNode).mockResolvedValue(node({ id: 'node_restored' }));
    const { result } = renderHook(() => useRestoreMoodboardNodes('prj_1', 'board_1'), { wrapper });

    await result.current.mutateAsync([
      node({ type: 'entity', assetId: null, entityId: 'ent_tam' }),
    ]);

    const [, , payload] = vi.mocked(api.addMoodboardNode).mock.calls[0]!;
    expect(payload).toMatchObject({ type: 'entity', entityId: 'ent_tam' });
    expect(payload).not.toHaveProperty('assetId');
  });

  it('carries every field the delete took with it — layout, z-order, group, lock and content', async () => {
    vi.mocked(api.addMoodboardNode).mockResolvedValue(node({ id: 'node_restored' }));
    const { result } = renderHook(() => useRestoreMoodboardNodes('prj_1', 'board_1'), { wrapper });

    await result.current.mutateAsync([
      node({
        type: 'note',
        assetId: null,
        entityId: null,
        x: 42,
        y: 17,
        width: 250,
        height: 160,
        rotation: 1.2,
        zOrder: 5,
        groupId: 'group_1',
        locked: true,
        data: { text: 'Colder' },
      }),
    ]);

    const [, , payload] = vi.mocked(api.addMoodboardNode).mock.calls[0]!;
    expect(payload).toEqual({
      type: 'note',
      x: 42,
      y: 17,
      width: 250,
      height: 160,
      rotation: 1.2,
      zOrder: 5,
      groupId: 'group_1',
      locked: true,
      data: { text: 'Colder' },
    });
  });

  it('restores a multi-select delete as one addMoodboardNode call per node, in the given order', async () => {
    vi.mocked(api.addMoodboardNode)
      .mockResolvedValueOnce(node({ id: 'restored_1' }))
      .mockResolvedValueOnce(node({ id: 'restored_2' }));
    const { result } = renderHook(() => useRestoreMoodboardNodes('prj_1', 'board_1'), { wrapper });

    const restored = await result.current.mutateAsync([
      node({ id: 'node_1', type: 'asset', assetId: 'asset_a', entityId: null }),
      node({ id: 'node_2', type: 'entity', assetId: null, entityId: 'ent_b' }),
    ]);

    expect(api.addMoodboardNode).toHaveBeenCalledTimes(2);
    expect(restored.map((given) => given.id)).toEqual(['restored_1', 'restored_2']);
  });
});
