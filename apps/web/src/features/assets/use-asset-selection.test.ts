// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAssetSelection } from './use-asset-selection';

const IDS = ['a', 'b', 'c', 'd', 'e'];
const NO_MODIFIERS = { shiftKey: false, metaKey: false, ctrlKey: false };

describe('useAssetSelection', () => {
  it('starts with nothing selected', () => {
    const { result } = renderHook(() => useAssetSelection());
    expect(result.current.selectedCount).toBe(0);
  });

  it('a plain click replaces the selection with just the one clicked', () => {
    const { result } = renderHook(() => useAssetSelection());

    act(() => result.current.handleClick(IDS, 0, NO_MODIFIERS));
    act(() => result.current.handleClick(IDS, 2, NO_MODIFIERS));

    expect([...result.current.selectedIds]).toEqual(['c']);
  });

  it('extends a range from the last plain click on shift-click, in either direction', () => {
    const { result } = renderHook(() => useAssetSelection());

    act(() => result.current.handleClick(IDS, 1, NO_MODIFIERS)); // anchor at 'b'
    act(() => result.current.handleClick(IDS, 3, { ...NO_MODIFIERS, shiftKey: true }));

    expect(result.current.selectedIds).toEqual(new Set(['b', 'c', 'd']));

    // A second shift-click still measures from the same anchor, not from
    // wherever the last shift-click landed.
    act(() => result.current.handleClick(IDS, 0, { ...NO_MODIFIERS, shiftKey: true }));
    expect(result.current.selectedIds).toEqual(new Set(['a', 'b']));
  });

  it('adds and removes one id on cmd/ctrl-click without touching the rest', () => {
    const { result } = renderHook(() => useAssetSelection());

    act(() => result.current.handleClick(IDS, 0, NO_MODIFIERS));
    act(() => result.current.handleClick(IDS, 2, { ...NO_MODIFIERS, metaKey: true }));
    expect(result.current.selectedIds).toEqual(new Set(['a', 'c']));

    act(() => result.current.handleClick(IDS, 0, { ...NO_MODIFIERS, ctrlKey: true }));
    expect(result.current.selectedIds).toEqual(new Set(['c']));
  });

  it('toggles a single id regardless of modifiers, for an explicit checkbox', () => {
    const { result } = renderHook(() => useAssetSelection());

    act(() => result.current.toggle(IDS, 1));
    act(() => result.current.toggle(IDS, 3));
    expect(result.current.selectedIds).toEqual(new Set(['b', 'd']));

    act(() => result.current.toggle(IDS, 1));
    expect(result.current.selectedIds).toEqual(new Set(['d']));
  });

  it('selects every id passed to selectAll', () => {
    const { result } = renderHook(() => useAssetSelection());

    act(() => result.current.selectAll(IDS));

    expect(result.current.selectedCount).toBe(5);
    expect(result.current.isSelected('e')).toBe(true);
  });

  it('clears the whole selection', () => {
    const { result } = renderHook(() => useAssetSelection());

    act(() => result.current.selectAll(IDS));
    act(() => result.current.clear());

    expect(result.current.selectedCount).toBe(0);
  });

  it('narrows the selection to exactly the ids given to replace', () => {
    const { result } = renderHook(() => useAssetSelection());

    act(() => result.current.selectAll(IDS));
    act(() => result.current.replace(['b', 'd']));

    expect(result.current.selectedIds).toEqual(new Set(['b', 'd']));
  });
});
