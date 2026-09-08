/** Result of probing one external dependency. */
export interface DependencyCheckResult {
  status: 'up' | 'down';
  latencyMs: number;
  /** Extra, dependency-specific information shown on the readiness endpoint. */
  details?: Record<string, unknown>;
  /** Present only when `status` is `down`. */
  error?: string;
}

/** Times `probe` and converts a thrown error into a `down` result. */
export async function measureCheck(
  probe: () => Promise<Record<string, unknown> | void>,
): Promise<DependencyCheckResult> {
  const startedAt = performance.now();
  try {
    const details = await probe();
    return {
      status: 'up',
      latencyMs: Math.round(performance.now() - startedAt),
      ...(details ? { details } : {}),
    };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
