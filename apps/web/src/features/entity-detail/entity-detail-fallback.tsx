'use client';

import type { EntityType } from '@level-zero/domain';
import { Button, RichTextEditor, Tag, type JSONContent } from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';

import { entityDocument } from '@/features/entities/entity-document';

import type { EntityDetailBody } from './entity-detail-renderers';

/** Where a type's browser lives, for the types that have one (§7's table). */
const OWNING_WORKSPACE: Partial<
  Record<EntityType, { label: string; path: (projectId: string) => string }>
> = {
  character: { label: 'Characters', path: (projectId) => `/projects/${projectId}/characters` },
  mechanic: { label: 'Mechanics', path: (projectId) => `/projects/${projectId}/mechanics` },
  system: { label: 'Mechanics', path: (projectId) => `/projects/${projectId}/mechanics` },
  region: { label: 'World', path: (projectId) => `/projects/${projectId}/world` },
  location: { label: 'World', path: (projectId) => `/projects/${projectId}/world` },
  faction: { label: 'World', path: (projectId) => `/projects/${projectId}/world` },
  culture: { label: 'World', path: (projectId) => `/projects/${projectId}/world` },
  technology: { label: 'World', path: (projectId) => `/projects/${projectId}/world` },
  event: { label: 'World', path: (projectId) => `/projects/${projectId}/world` },
  hazard: { label: 'World', path: (projectId) => `/projects/${projectId}/world` },
  lore: { label: 'World', path: (projectId) => `/projects/${projectId}/world` },
  idea: { label: 'Idea Lab', path: (projectId) => `/projects/${projectId}/idea-lab` },
  moodboard: { label: 'Moodboards', path: (projectId) => `/projects/${projectId}/moodboards` },
  document: { label: 'GDD', path: (projectId) => `/projects/${projectId}/gdd` },
  design_pillar: { label: 'Project Overview', path: (projectId) => `/projects/${projectId}` },
};

/** `assetId` -> "Asset Id"; `tuningParameters` -> "Tuning Parameters". */
function fieldLabel(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** A scalar `data` value as one honest line of text, or null for nothing worth a row. */
function formatScalar(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const primitive = value.every((item) => typeof item === 'string' || typeof item === 'number');
    return primitive ? value.join(', ') : JSON.stringify(value);
  }
  return JSON.stringify(value);
}

/**
 * What every entity type gets until it earns a bespoke body
 * (docs/decisions/canonical-entity-routes.md §7): the description, the tags,
 * any rich-text field `data` is carrying, whatever else is in `data`, and a
 * link to the workspace that owns the type where one exists.
 *
 * Relationships and version history are not here — the shell renders those
 * for every type, fallback or not.
 */
export const EntityDetailFallback: EntityDetailBody = ({ projectId, entity }) => {
  const dataKeys = Object.keys(entity.data);
  const richTextFields = dataKeys.filter((key) => entityDocument(entity, key) !== null);
  const scalarFields = dataKeys
    .filter((key) => !richTextFields.includes(key))
    .map((key) => [key, formatScalar(entity.data[key])] as const)
    .filter((entry): entry is [string, string] => entry[1] !== null);
  const workspace = OWNING_WORKSPACE[entity.type];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{entity.description ?? 'No description yet.'}</p>

      {entity.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entity.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}

      {richTextFields.map((field) => (
        <RichTextEditor
          key={field}
          mode="notes"
          editable={false}
          content={entityDocument(entity, field) as JSONContent}
          label={fieldLabel(field)}
        />
      ))}

      {scalarFields.length > 0 && (
        <dl className="flex flex-col gap-1.5 text-xs">
          {scalarFields.map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <dt className="shrink-0 text-faint-foreground">{fieldLabel(key)}</dt>
              <dd className="truncate text-muted-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {workspace && (
        <Button asChild variant="secondary" size="sm" className="self-start">
          <Link href={workspace.path(projectId) as Route}>Open in {workspace.label}</Link>
        </Button>
      )}
    </div>
  );
};
