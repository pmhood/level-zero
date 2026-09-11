'use client';

import type { Route } from 'next';
import { useCallback, useEffect, useState } from 'react';

export interface RecentPaletteItem {
  id: string;
  label: string;
  description: string;
  href: Route;
}

const MAX_RECENT_ITEMS = 8;

function storageKey(projectId: string): string {
  return `level-zero:command-palette:recent:${projectId}`;
}

function readRecentItems(projectId: string): RecentPaletteItem[] {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentPaletteItem[]) : [];
  } catch {
    return [];
  }
}

function writeRecentItems(projectId: string, items: RecentPaletteItem[]): void {
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(items));
  } catch {
    // Private browsing, storage disabled, or over quota — recents are a
    // convenience, not a source of truth, so failing silently is fine.
  }
}

/**
 * The palette's "recent entities/actions" (issue #68's acceptance
 * criteria), kept client-side and scoped to one project. Nothing in the
 * domain models "recently opened" — this is exactly the kind of per-viewer
 * convenience `localStorage` is for, not a reason to add a server concept.
 */
export function useRecentPaletteItems(projectId: string) {
  const [items, setItems] = useState<RecentPaletteItem[]>([]);

  useEffect(() => {
    setItems(readRecentItems(projectId));
  }, [projectId]);

  const record = useCallback(
    (item: RecentPaletteItem) => {
      setItems((current) => {
        const next = [item, ...current.filter((existing) => existing.id !== item.id)].slice(
          0,
          MAX_RECENT_ITEMS,
        );
        writeRecentItems(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  return { items, record };
}
