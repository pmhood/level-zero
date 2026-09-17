'use client';

import { useCallback, useState } from 'react';

/** The modifier keys a click or keyboard activation carries — cmd on macOS, ctrl elsewhere. */
export interface AssetClickModifiers {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

export interface UseAssetSelectionResult {
  selectedIds: ReadonlySet<string>;
  selectedCount: number;
  isSelected: (id: string) => boolean;
  /**
   * A tile or row's own click: plain replaces the selection with just this
   * one, shift extends a range from the last plain click or checkbox toggle,
   * cmd/ctrl adds or removes this one without touching the rest.
   */
  handleClick: (ids: readonly string[], index: number, modifiers: AssetClickModifiers) => void;
  /** A checkbox's own click: always adds or removes just this one. */
  toggle: (ids: readonly string[], index: number) => void;
  /** Every id currently on the loaded page. */
  selectAll: (ids: readonly string[]) => void;
  clear: () => void;
  /** Narrows the selection to exactly these ids — a bulk action's partial failure. */
  replace: (ids: Iterable<string>) => void;
}

/**
 * Multi-select state for the asset library's grid and list (issue #175): one
 * `Set` of ids that a click, a shift-click range, a cmd/ctrl-click toggle and
 * a checkbox all read and write the same way, so the inspector and the
 * selection bar never have to reconcile two ideas of what is selected.
 *
 * Deliberately not persisted anywhere — a fresh `useState` per mount is the
 * whole implementation of the issue's "selection lives with the workspace
 * and is cleared by navigation."
 */
export function useAssetSelection(): UseAssetSelectionResult {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const handleClick = useCallback(
    (ids: readonly string[], index: number, modifiers: AssetClickModifiers) => {
      const id = ids[index];
      if (id === undefined) return;

      if (modifiers.shiftKey && anchorIndex !== null) {
        const [start, end] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
        setSelectedIds(new Set(ids.slice(start, end + 1)));
        return; // The anchor stays put, so a second shift-click still measures from the same start.
      }

      if (modifiers.metaKey || modifiers.ctrlKey) {
        setSelectedIds((current) => toggleId(current, id));
        setAnchorIndex(index);
        return;
      }

      setSelectedIds(new Set([id]));
      setAnchorIndex(index);
    },
    [anchorIndex],
  );

  const toggle = useCallback((ids: readonly string[], index: number) => {
    const id = ids[index];
    if (id === undefined) return;
    setSelectedIds((current) => toggleId(current, id));
    setAnchorIndex(index);
  }, []);

  const selectAll = useCallback((ids: readonly string[]) => {
    setSelectedIds(new Set(ids));
    setAnchorIndex(ids.length - 1);
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorIndex(null);
  }, []);

  const replace = useCallback((ids: Iterable<string>) => {
    setSelectedIds(new Set(ids));
    setAnchorIndex(null);
  }, []);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected,
    handleClick,
    toggle,
    selectAll,
    clear,
    replace,
  };
}

function toggleId(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
