'use client';

import { useCallback, useState } from 'react';

import { apiErrorMessage } from '@/lib/api';

export interface BulkActionFailure {
  assetId: string;
  message: string;
}

export interface BulkActionResult {
  succeededIds: string[];
  failures: BulkActionFailure[];
}

/**
 * Runs one of the asset library's existing single-asset actions over a whole
 * selection (issue #175) — no bulk endpoint was built, because there is
 * nothing a bulk endpoint would do that firing the same request once per
 * asset does not. `Promise.allSettled` so one asset's failure never stops
 * the rest, and the caller gets back exactly which ids failed and why, so
 * the selection can be narrowed to just those for a retry.
 */
export function useBulkAssetAction() {
  const [isPending, setIsPending] = useState(false);

  const run = useCallback(
    async (
      assetIds: readonly string[],
      action: (assetId: string) => Promise<unknown>,
    ): Promise<BulkActionResult> => {
      setIsPending(true);
      try {
        const outcomes = await Promise.allSettled(assetIds.map((assetId) => action(assetId)));
        const succeededIds: string[] = [];
        const failures: BulkActionFailure[] = [];

        outcomes.forEach((outcome, index) => {
          const assetId = assetIds[index]!;
          if (outcome.status === 'fulfilled') {
            succeededIds.push(assetId);
          } else {
            failures.push({
              assetId,
              message: apiErrorMessage(outcome.reason, 'Could not apply this action.'),
            });
          }
        });

        return { succeededIds, failures };
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { run, isPending };
}
