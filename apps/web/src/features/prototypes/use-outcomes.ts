'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import * as api from '@/lib/api';

const outcomeKeys = {
  compare: (projectId: string, prototypeId: string, fromId: string, toId: string) =>
    [
      'projects',
      projectId,
      'prototypes',
      prototypeId,
      'versions',
      'outcomes',
      fromId,
      toId,
    ] as const,
};

/** What changed between two versions, beside what the playtests of each measured. */
export function useOutcomeComparison(
  projectId: string,
  prototypeId: string | null,
  fromId: string | null,
  toId: string | null,
) {
  return useQuery({
    queryKey: outcomeKeys.compare(projectId, prototypeId ?? '', fromId ?? '', toId ?? ''),
    queryFn: () =>
      api.compareOutcomes(projectId, prototypeId as string, fromId as string, toId as string),
    enabled:
      Boolean(projectId) &&
      Boolean(prototypeId) &&
      Boolean(fromId) &&
      Boolean(toId) &&
      fromId !== toId,
  });
}

/**
 * Asks a model to read the comparison.
 *
 * A mutation rather than a query because it is an act with a record behind it:
 * every ask writes a `Generation`, so nothing here may be re-run because a
 * component remounted or a window regained focus.
 */
export function useOutcomeInterpretation(projectId: string, prototypeId: string) {
  return useMutation({
    mutationFn: (versions: { from: string; to: string }) =>
      api.interpretOutcomes(projectId, prototypeId, versions),
  });
}
