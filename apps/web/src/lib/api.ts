import { env } from './env';
import type { HealthReport } from './health';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * Reads the API's health summary. The summary endpoint answers 200 even when a
 * dependency is down, so the panel can show *which* one is broken.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthReport> {
  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/health`, {
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    throw new ApiRequestError(`API health request failed (${response.status})`, response.status);
  }

  return (await response.json()) as HealthReport;
}
