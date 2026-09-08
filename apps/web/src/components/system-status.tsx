'use client';

import { Card, CardDescription, CardHeader, CardTitle, StatusBadge } from '@level-zero/ui';
import { useQuery } from '@tanstack/react-query';

import { fetchHealth } from '@/lib/api';
import { overallTone, toDependencyRows } from '@/lib/health';

/**
 * Proves the whole local stack is wired up: browser -> API -> Postgres/Redis.
 */
export function SystemStatus() {
  const { data, isError, isPending, error } = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 15_000,
  });

  const rows = toDependencyRows(data);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>System status</CardTitle>
          <StatusBadge tone={overallTone(data, isError)}>
            {isPending ? 'checking' : isError ? 'unreachable' : (data?.status ?? 'unknown')}
          </StatusBadge>
        </div>
        <CardDescription>Live readiness of the API and its dependencies.</CardDescription>
      </CardHeader>

      {isError ? (
        <p className="text-sm text-red-400">
          {error instanceof Error ? error.message : 'The API could not be reached.'}
        </p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rows.length === 0 ? (
            <li className="py-2 text-muted-foreground">Waiting for the first response…</li>
          ) : (
            rows.map((row) => (
              <li key={row.name} className="flex items-center justify-between gap-4 py-2">
                <span className="font-medium">{row.name}</span>
                <span className="flex items-center gap-3">
                  <span className="text-muted-foreground">{row.detail}</span>
                  <StatusBadge tone={row.tone}>{row.label}</StatusBadge>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </Card>
  );
}
