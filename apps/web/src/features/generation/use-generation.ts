'use client';

import type { Generation, Job } from '@level-zero/domain';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import * as api from '@/lib/api';

import {
  buildGenerationRequest,
  isGenerationRunning,
  isImageGeneration,
  queuePollInterval,
  type BuildGenerationRequest,
} from './generation';

/** How many recent generations a provenance or history read scans. */
const RECENT_LIMIT = 20;

const generationKeys = {
  all: (projectId: string) => ['projects', projectId, 'generations'] as const,
  running: (projectId: string) => ['projects', projectId, 'generations', 'running'] as const,
  queue: (projectId: string) => ['projects', projectId, 'generations', 'queue'] as const,
  one: (projectId: string, generationId: string) =>
    ['projects', projectId, 'generations', generationId] as const,
  provenance: (projectId: string, generationId: string) =>
    ['projects', projectId, 'generations', generationId, 'provenance'] as const,
  results: (projectId: string, assetIds: readonly string[]) =>
    ['projects', projectId, 'generations', 'results', [...assetIds]] as const,
  job: (projectId: string, generationId: string) =>
    ['projects', projectId, 'jobs', 'generation', generationId] as const,
};

/**
 * The image generations still in flight for this project.
 *
 * This is what makes a reload reconnect: the surface holds no record of what it
 * started, so it asks which work is still running and picks that up. The
 * capability filter is applied here rather than in the query, because the
 * listing endpoint filters one capability at a time and this surface produces
 * three.
 */
export function useRunningImageGenerations(projectId: string) {
  return useQuery({
    queryKey: generationKeys.running(projectId),
    queryFn: async () => {
      const page = await api.listGenerations(projectId, {
        status: ['queued', 'running'],
        limit: RECENT_LIMIT,
      });
      return page.items.filter(isImageGeneration);
    },
    enabled: Boolean(projectId),
  });
}

/**
 * What the Generation Queue panel (#180) shows: queued and running work, plus
 * a failed generation until it is dismissed. `Generation` is the only thing
 * read here — never the job behind it, let alone BullMQ — matching the
 * issue's settled scope.
 *
 * There is no websocket or SSE layer for this: `refetchInterval` polls at a
 * modest, fixed interval for as long as anything is queued or running, and
 * stops the moment nothing is. Starting or cancelling a generation anywhere
 * in the app invalidates `generationKeys.all`, which this key falls under, so
 * a poll restarts as soon as there is new work to show even while stopped.
 *
 * A generation that drops out of the active set between polls (it completed,
 * failed or was cancelled) has already written any outputs it is going to, so
 * the asset library is invalidated right here — the panel's outputs appear
 * without a reload, without the panel reaching into a library it doesn't own.
 */
export function useGenerationQueue(projectId: string) {
  const queryClient = useQueryClient();
  const previousActiveIds = useRef<ReadonlySet<string>>(new Set());

  const query = useQuery({
    queryKey: generationKeys.queue(projectId),
    queryFn: async (): Promise<Generation[]> => {
      const page = await api.listGenerations(projectId, {
        status: ['queued', 'running', 'failed'],
        limit: RECENT_LIMIT,
      });
      return page.items;
    },
    enabled: Boolean(projectId),
    refetchInterval: (query) => queuePollInterval(query.state.data),
  });

  useEffect(() => {
    const items = query.data;
    if (!items) return;

    const activeIds = new Set(items.filter(isGenerationRunning).map((item) => item.id));
    const justFinished = [...previousActiveIds.current].some((id) => !activeIds.has(id));
    previousActiveIds.current = activeIds;

    if (justFinished) {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'assets'] });
    }
  }, [query.data, projectId, queryClient]);

  return query;
}

export function useGeneration(projectId: string, generationId: string | null) {
  return useQuery({
    queryKey: generationKeys.one(projectId, generationId ?? ''),
    queryFn: () => api.getGeneration(projectId, generationId as string),
    enabled: Boolean(projectId) && Boolean(generationId),
  });
}

/**
 * The job running one generation, which is where its progress lives.
 *
 * Read once on mount and then kept current by `useJobStream`, so a surface that
 * reconnects mid-run shows the step the worker last reported rather than
 * starting its progress from zero.
 */
export function useGenerationJob(projectId: string, generationId: string | null) {
  return useQuery({
    queryKey: generationKeys.job(projectId, generationId ?? ''),
    queryFn: async () => {
      const page = await api.listJobs(projectId, {
        kind: 'generation',
        targetId: generationId as string,
        limit: 1,
      });
      return page.items[0] ?? null;
    },
    enabled: Boolean(projectId) && Boolean(generationId),
  });
}

/**
 * The assets a generation produced.
 *
 * Read as assets rather than bare ids because a result grid shows the filename
 * and the archived state, and because handing an `Asset` to whoever uses the
 * result is what lets them link it without a second lookup.
 */
export function useGenerationResults(projectId: string, assetIds: readonly string[]) {
  return useQuery({
    queryKey: generationKeys.results(projectId, assetIds),
    queryFn: () => Promise.all(assetIds.map((assetId) => api.getAsset(projectId, assetId))),
    enabled: Boolean(projectId) && assetIds.length > 0,
  });
}

/** Everything that explains one result: provider, model, prompt, inputs, parent. */
export function useGenerationProvenance(projectId: string, generationId: string | null) {
  return useQuery({
    queryKey: generationKeys.provenance(projectId, generationId ?? ''),
    queryFn: () => api.getGenerationProvenance(projectId, generationId as string),
    enabled: Boolean(projectId) && Boolean(generationId),
  });
}

/**
 * Records the ask and queues it. Resolves as soon as the API has the record —
 * the provider call happens in the worker, and progress arrives on the stream.
 */
export function useStartGeneration(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BuildGenerationRequest) =>
      api.createGeneration(projectId, buildGenerationRequest(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: generationKeys.all(projectId) });
    },
  });
}

export function useCancelGeneration(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (generationId: string) => api.cancelGeneration(projectId, generationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: generationKeys.all(projectId) });
    },
  });
}

/**
 * Follows the project's job events for as long as the surface is mounted.
 *
 * The API relays what the worker publishes, so progress arrives instead of
 * being asked for. The event is not treated as the truth on its own: it names
 * the job that changed, and the records it invalidates are re-read: the worker
 * finishes the generation *before* it marks the job complete, so a `complete`
 * event always arrives after the outputs exist.
 *
 * Silently does nothing where `EventSource` is unavailable — during
 * server rendering, in particular. The records are still read on mount, so the
 * surface degrades to "correct but not live" rather than to broken.
 */
export function useJobStream(projectId: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId || typeof EventSource === 'undefined') return;

    const source = new EventSource(api.jobStreamUrl(projectId));
    source.onmessage = (event: MessageEvent<string>) => {
      applyJobEvent(queryClient, projectId, event.data);
    };
    // A dropped stream is not an error the user can act on: `EventSource`
    // reconnects on its own, and the job record stays authoritative meanwhile.

    return () => source.close();
  }, [projectId, queryClient]);
}

/** Writes one job event into the cache and re-reads what it affects. */
function applyJobEvent(queryClient: QueryClient, projectId: string, data: string): void {
  const job = parseJob(data);
  if (!job || job.kind !== 'generation') return;

  queryClient.setQueryData(generationKeys.job(projectId, job.targetId), job);
  queryClient.invalidateQueries({ queryKey: generationKeys.all(projectId) });

  // A finished generation has written new assets; every library that lists them
  // is now stale.
  if (job.status === 'complete') {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'assets'] });
  }
}

/**
 * Reads a job off the wire.
 *
 * `createdAt` and friends arrive as JSON strings rather than `Date`s. Only
 * `progress` and `status` are read from an event, so they are left as they came
 * rather than revived — the record is re-read for anything else.
 */
function parseJob(data: string): Job | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Partial<Job>;
    return candidate.id && candidate.targetId && candidate.progress ? (candidate as Job) : null;
  } catch {
    return null;
  }
}
