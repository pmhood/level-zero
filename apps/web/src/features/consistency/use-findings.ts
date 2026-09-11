'use client';

import type { Job } from '@level-zero/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import * as api from '@/lib/api';

const findingKeys = {
  all: (projectId: string) => ['projects', projectId, 'findings'] as const,
  list: (projectId: string, params: api.ListFindingsParams) =>
    ['projects', projectId, 'findings', params] as const,
  scanJob: (projectId: string) => ['projects', projectId, 'jobs', 'consistency_scan'] as const,
};

export function useFindings(projectId: string, params: api.ListFindingsParams) {
  return useQuery({
    queryKey: findingKeys.list(projectId, params),
    queryFn: () => api.listFindings(projectId, params),
    enabled: Boolean(projectId),
  });
}

/**
 * The most recent consistency-scan job for this project, whatever its
 * status. This answers two different questions the empty states need told
 * apart: whether a scan is running right now, and whether one has ever run
 * at all (docs/decisions/consistency-findings.md §5 — every surface that
 * shows findings shows when it last looked).
 */
export function useLatestConsistencyScan(projectId: string) {
  return useQuery({
    queryKey: findingKeys.scanJob(projectId),
    queryFn: async () => {
      const page = await api.listJobs(projectId, { kind: 'consistency_scan', limit: 1 });
      return page.items[0] ?? null;
    },
    enabled: Boolean(projectId),
  });
}

/** Queues a project-wide scan. A scan already running is returned rather than duplicated. */
export function useRequestConsistencyScan(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.requestConsistencyScan(projectId),
    onSuccess: (job) => {
      queryClient.setQueryData(findingKeys.scanJob(projectId), job);
    },
  });
}

export function useDismissFinding(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ findingId, ...input }: { findingId: string } & api.DismissFindingParams) =>
      api.dismissFinding(projectId, findingId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: findingKeys.all(projectId) });
    },
  });
}

/** Undoes a dismissal — one click, and the finding goes back to `open`. */
export function useReopenFinding(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (findingId: string) => api.reopenFinding(projectId, findingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: findingKeys.all(projectId) });
    },
  });
}

/**
 * Follows this project's job events for consistency-scan progress, the way
 * `useJobStream` (features/generation) follows generation jobs. Kept as its
 * own small subscription rather than widening that hook's generation-specific
 * invalidation to a second job kind.
 *
 * Silently does nothing where `EventSource` is unavailable — during server
 * rendering, in particular — the same as `useJobStream`.
 */
export function useConsistencyScanStream(projectId: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId || typeof EventSource === 'undefined') return;

    const source = new EventSource(api.jobStreamUrl(projectId));
    source.onmessage = (event: MessageEvent<string>) => {
      const job = parseConsistencyScanJob(event.data);
      if (!job) return;

      queryClient.setQueryData(findingKeys.scanJob(projectId), job);
      // The worker writes findings before it marks the job complete, so a
      // `complete` event always arrives after the rows exist.
      if (job.status === 'complete') {
        queryClient.invalidateQueries({ queryKey: findingKeys.all(projectId) });
      }
    };

    return () => source.close();
  }, [projectId, queryClient]);
}

function parseConsistencyScanJob(data: string): Job | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Partial<Job>;
    return candidate.kind === 'consistency_scan' && candidate.id && candidate.progress
      ? (candidate as Job)
      : null;
  } catch {
    return null;
  }
}

/** The canonical entity behind one piece of a finding's evidence, resolved live. */
export function useEvidenceEntity(projectId: string, entityId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'entities', entityId],
    queryFn: () => api.getEntity(projectId, entityId),
    enabled: Boolean(projectId) && Boolean(entityId),
  });
}

/** How many open findings a query for one entity's contextual entry point scans. */
const ENTITY_FINDINGS_SCAN_LIMIT = 200;

/**
 * The open findings whose evidence cites this entity — the contextual entry
 * point the issue asks affected entities and documents to offer.
 *
 * Filters client-side over the project's open findings rather than adding a
 * server-side, evidence-grained filter: a project's finding set is bounded
 * the same way its entity set is, and every caller of this hook shares one
 * cached read of the project's open findings (same query key as
 * `useFindings(projectId, { status: ['open'], limit: 200 })`), so mentioning
 * the same entity from three places in a document costs one request.
 */
export function useEntityFindings(projectId: string, entityId: string) {
  const params: api.ListFindingsParams = { status: ['open'], limit: ENTITY_FINDINGS_SCAN_LIMIT };

  return useQuery({
    queryKey: findingKeys.list(projectId, params),
    queryFn: () => api.listFindings(projectId, params),
    enabled: Boolean(projectId) && Boolean(entityId),
    select: (page) => page.items.filter((finding) => hasEvidenceFor(finding, entityId)),
  });
}

function hasEvidenceFor(finding: { evidence: readonly { entityId: string }[] }, entityId: string) {
  return finding.evidence.some((evidence) => evidence.entityId === entityId);
}
