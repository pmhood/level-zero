/**
 * Base class for expected, domain-level failures.
 *
 * Transport layers map these onto their own error shapes (HTTP status codes in
 * the API, job failures in the worker) so domain code never imports a framework
 * just to report a problem.
 */
export abstract class DomainError extends Error {
  /** Stable, machine-readable discriminator. */
  abstract readonly code: string;

  readonly details: Readonly<Record<string, unknown>>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.details = Object.freeze({ ...details });
    Error.captureStackTrace?.(this, new.target);
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'not_found';

  constructor(resource: string, id: string) {
    super(`${resource} ${id} was not found`, { resource, id });
  }
}

export class ValidationError extends DomainError {
  readonly code = 'validation_failed';

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details);
  }
}

/**
 * The caller may see the thing but not do this to it — editing a comment
 * somebody else wrote.
 *
 * Distinct from `NotFoundError`, which is what an id from *another project*
 * reports: project scoping is structural and answers "not found" precisely so a
 * caller cannot probe for rows it may not see. This is for the narrower case
 * where the row is already on the caller's screen and the act is still not
 * theirs.
 */
export class ForbiddenError extends DomainError {
  readonly code = 'forbidden';

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details);
  }
}

export class ConflictError extends DomainError {
  readonly code = 'conflict';

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, details);
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
