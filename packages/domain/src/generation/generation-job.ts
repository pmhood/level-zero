/**
 * The steps a generation job reports, in order, as a UI shows them.
 *
 * Both processes read this: the API sizes the job record from its length when
 * the work is queued, and the worker names each step as it reaches it. Keeping
 * one list is what lets a progress indicator say "2 of 3 — Generating" without
 * the two sides having to agree twice.
 */
export const GENERATION_JOB_STEPS = ['Preparing context', 'Generating', 'Storing result'] as const;
