'use client';

import type { Asset, Entity, MoodboardConnector, MoodboardNode } from '@level-zero/domain';
import { createContext, useContext } from 'react';

/**
 * What a node on the canvas needs to draw itself.
 *
 * A shape's `props` carry a reference, never a copy, so the name of an entity
 * and the filename of an asset are read from the canonical rows the board is
 * pointing at. The layers the canvas draws sit under its own transform rather
 * than under the workspace, so this is the only route from the workspace's
 * queries into a tile.
 */
export interface MoodboardCanvasContextValue {
  projectId: string;
  /** What is on the board, as the canvas is currently showing it. */
  nodes: readonly MoodboardNode[];
  connectors: readonly MoodboardConnector[];
  entities: ReadonlyMap<string, Entity>;
  assets: ReadonlyMap<string, Asset>;
  /** The API URL an asset's bytes stream from. */
  assetSrc: (projectId: string, assetId: string) => string;
}

const MoodboardCanvasContext = createContext<MoodboardCanvasContextValue | null>(null);

export const MoodboardCanvasProvider = MoodboardCanvasContext.Provider;

export function useMoodboardCanvasContext(): MoodboardCanvasContextValue {
  const value = useContext(MoodboardCanvasContext);
  if (!value) throw new Error('Moodboard shapes can only render inside a moodboard canvas');
  return value;
}
