/**
 * The kinds of game object Workbench understands.
 *
 * Every tool reads and writes these same canonical entities. Adding a tool does
 * not mean adding a store: it means adding a view over one of these types.
 *
 * Note: the type is `asset_reference` (an entity that *points at* an asset).
 * Assets themselves are a separate concept and are not entities.
 */
export const ENTITY_TYPES = [
  'idea',
  'design_pillar',
  'character',
  'location',
  'faction',
  'region',
  'lore',
  'event',
  'hazard',
  'culture',
  'technology',
  'mechanic',
  'system',
  'asset_reference',
  'scene',
  'moodboard',
  'asset_collection',
  'document',
  'prototype',
  'build',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export function isEntityType(value: unknown): value is EntityType {
  return typeof value === 'string' && (ENTITY_TYPES as readonly string[]).includes(value);
}
