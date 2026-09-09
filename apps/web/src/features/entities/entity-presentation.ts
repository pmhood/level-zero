import type { EntityStatus, EntityType, RelationType } from '@level-zero/domain';
import type { StatusTone } from '@level-zero/ui';

/**
 * Display labels for canonical entity types, shared by any tool that lists or
 * links entities (Idea Lab, Mechanics, World, ...).
 */
const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  idea: 'Idea',
  design_pillar: 'Design Pillar',
  character: 'Character',
  location: 'Location',
  faction: 'Faction',
  region: 'Region',
  lore: 'Lore',
  event: 'Event',
  hazard: 'Hazard',
  culture: 'Culture',
  technology: 'Technology',
  mechanic: 'Mechanic',
  system: 'System',
  asset_reference: 'Asset Reference',
  scene: 'Scene',
  moodboard: 'Moodboard',
  document: 'Document',
  prototype: 'Prototype',
  build: 'Build',
};

export function entityTypeLabel(type: EntityType): string {
  return ENTITY_TYPE_LABELS[type];
}

/** Edges read source-first, so these labels are written from the source's side. */
const RELATION_LABELS: Record<RelationType, string> = {
  contains: 'Contains',
  references: 'References',
  inspired_by: 'Inspired by',
  generated_from: 'Generated from',
  derived_from: 'Derived from',
  promoted_to: 'Promoted to',
  depends_on: 'Depends on',
  implements: 'Implements',
  appears_in: 'Appears in',
  belongs_to: 'Belongs to',
  controls: 'Controls',
  replaces: 'Replaces',
};

export function relationLabel(relation: RelationType): string {
  return RELATION_LABELS[relation];
}

export interface EntityStatusBadge {
  tone: StatusTone;
  label: string;
}

/**
 * Maps an entity's lifecycle status onto a `StatusBadge` tone and label.
 * Draft and archived share a neutral tone; the label (never color alone)
 * tells them apart.
 */
export function entityStatusBadge(status: EntityStatus): EntityStatusBadge {
  switch (status) {
    case 'active':
      return { tone: 'success', label: 'Active' };
    case 'archived':
      return { tone: 'neutral', label: 'Archived' };
    case 'draft':
      return { tone: 'neutral', label: 'Draft' };
  }
}
