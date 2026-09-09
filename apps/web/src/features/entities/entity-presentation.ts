import type { EntityStatus, EntityType } from '@level-zero/domain';
import type { StatusTone } from '@level-zero/ui';

/**
 * Display labels for canonical entity types, shared by any tool that lists or
 * links entities (Idea Lab today, Characters/Mechanics/World later).
 */
const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  idea: 'Idea',
  design_pillar: 'Design Pillar',
  character: 'Character',
  location: 'Location',
  faction: 'Faction',
  mechanic: 'Mechanic',
  system: 'System',
  asset_reference: 'Asset Reference',
  scene: 'Scene',
  document: 'Document',
  prototype: 'Prototype',
  build: 'Build',
};

export function entityTypeLabel(type: EntityType): string {
  return ENTITY_TYPE_LABELS[type];
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
