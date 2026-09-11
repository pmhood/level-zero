// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useRecentPaletteItems, type RecentPaletteItem } from './use-recent-palette-items';

function item(overrides: Partial<RecentPaletteItem> = {}): RecentPaletteItem {
  return {
    id: 'ent_kael',
    label: 'Kael Voss',
    description: 'Character',
    href: '/projects/prj_1/entities/ent_kael' as never,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('useRecentPaletteItems', () => {
  it('starts empty for a project with no history', () => {
    const { result } = renderHook(() => useRecentPaletteItems('prj_1'));
    expect(result.current.items).toEqual([]);
  });

  it('records an item as the most recent', () => {
    const { result } = renderHook(() => useRecentPaletteItems('prj_1'));

    act(() => result.current.record(item()));

    expect(result.current.items).toEqual([item()]);
  });

  it('moves a re-recorded item back to the front instead of duplicating it', () => {
    const { result } = renderHook(() => useRecentPaletteItems('prj_1'));

    act(() => result.current.record(item({ id: 'a', label: 'A' })));
    act(() => result.current.record(item({ id: 'b', label: 'B' })));
    act(() => result.current.record(item({ id: 'a', label: 'A' })));

    expect(result.current.items.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('caps history at 8 items, dropping the oldest', () => {
    const { result } = renderHook(() => useRecentPaletteItems('prj_1'));

    for (let index = 0; index < 10; index += 1) {
      act(() => result.current.record(item({ id: `ent_${index}` })));
    }

    expect(result.current.items).toHaveLength(8);
    expect(result.current.items[0]?.id).toBe('ent_9');
    expect(result.current.items.map((entry) => entry.id)).not.toContain('ent_0');
  });

  it('keeps history scoped to one project', () => {
    const { result: projectOne } = renderHook(() => useRecentPaletteItems('prj_1'));
    act(() => projectOne.current.record(item({ id: 'a' })));

    const { result: projectTwo } = renderHook(() => useRecentPaletteItems('prj_2'));
    expect(projectTwo.current.items).toEqual([]);
  });

  it('persists across remounts of the same project', () => {
    const { result, unmount } = renderHook(() => useRecentPaletteItems('prj_1'));
    act(() => result.current.record(item()));
    unmount();

    const { result: remounted } = renderHook(() => useRecentPaletteItems('prj_1'));
    expect(remounted.current.items).toEqual([item()]);
  });
});
