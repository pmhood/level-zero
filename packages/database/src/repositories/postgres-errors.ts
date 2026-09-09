/** Postgres SQLSTATE for a unique-constraint violation. */
export const UNIQUE_VIOLATION = '23505';

/** Drizzle wraps driver errors, so the SQLSTATE lives on the cause chain. */
export function hasPostgresCode(error: unknown, code: string): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as Error & { code?: string }).code === code) return true;
  }
  return false;
}
