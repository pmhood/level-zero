'use client';

import { useEffect, useState } from 'react';

/**
 * The four positions the mockup's switcher has. Only `grid` and `list` are
 * views this issue (#171) builds; `collections` and `pipeline` are reserved
 * slots for #178 and #179, rendered disabled in `ViewSwitcher` until then.
 */
export const ASSET_VIEWS = ['grid', 'list', 'collections', 'pipeline'] as const;
export type AssetView = (typeof ASSET_VIEWS)[number];

const DEFAULT_VIEW: AssetView = 'grid';
const STORAGE_KEY = 'level-zero:assets:view';

function isAssetView(value: string | null): value is AssetView {
  return (ASSET_VIEWS as readonly string[]).includes(value ?? '');
}

function readStoredView(): AssetView {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isAssetView(raw) ? raw : DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

/**
 * The grid/list choice, persisted across navigation (issue #171's acceptance
 * criteria) the same way `useRecentPaletteItems` persists its recents:
 * `localStorage`, read back after mount so a server-rendered page never
 * disagrees with what the client already had stored.
 */
export function useAssetView(): [AssetView, (view: AssetView) => void] {
  const [view, setView] = useState<AssetView>(DEFAULT_VIEW);

  useEffect(() => {
    setView(readStoredView());
  }, []);

  function change(next: AssetView) {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing, storage disabled, or over quota — the choice just
      // stops persisting; the workspace still works for this session.
    }
  }

  return [view, change];
}
