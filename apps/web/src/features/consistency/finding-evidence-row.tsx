'use client';

import type { FindingEvidence } from '@level-zero/domain';
import type { Route } from 'next';
import Link from 'next/link';

import { entityTypeLabel } from '@/features/entities/entity-presentation';
import { ApiRequestError } from '@/lib/api';

import { canonicalEntityHref } from './consistency';
import { useEvidenceEntity } from './use-findings';

/**
 * One place a finding points at, and the way through to it.
 *
 * Evidence is entity-grained, never block-grained (§7.3 — there is no stable
 * address for a position inside a document), so what this offers is the
 * entity's canonical workspace, not a highlighted passage. The entity is
 * re-resolved on every render rather than trusted from the scan, so a rename
 * or an archive since the last scan still reads correctly, and a deleted
 * entity reads as "no longer in the project" instead of a dead link.
 */
export function FindingEvidenceRow({
  projectId,
  evidence,
}: {
  projectId: string;
  evidence: FindingEvidence;
}) {
  const entityQuery = useEvidenceEntity(projectId, evidence.entityId);
  const entity = entityQuery.data;
  const missing =
    entityQuery.isError &&
    entityQuery.error instanceof ApiRequestError &&
    entityQuery.error.status === 404;
  const href = entity ? canonicalEntityHref(projectId, entity.type) : null;

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-1.5">
      <p className="min-w-0 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{evidence.where}</span>
        {' — '}
        {evidence.states}
      </p>

      {href && entity ? (
        <Link
          href={href as Route}
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          Open {entity.name}
        </Link>
      ) : missing ? (
        <span className="shrink-0 text-xs text-faint-foreground">No longer in the project</span>
      ) : entity ? (
        <span className="shrink-0 text-xs text-faint-foreground">
          {entityTypeLabel(entity.type)} — no workspace page yet
        </span>
      ) : null}
    </li>
  );
}
