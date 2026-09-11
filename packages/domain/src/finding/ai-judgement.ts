import { ValidationError } from '../shared/errors';
import { fingerprint } from './consistency-check';
import {
  FINDING_SEVERITIES,
  MAX_FINDING_EVIDENCE_STATES_LENGTH,
  MAX_FINDING_EVIDENCE_WHERE_LENGTH,
  MAX_FINDING_SUMMARY_LENGTH,
  MIN_FINDING_EVIDENCE,
  type CheckFinding,
  type FindingEvidence,
  type FindingSeverity,
} from './finding';

/**
 * How a judgement must answer, stated once so the prompt that asks for it and
 * the parser that reads it can never drift apart.
 *
 * The wording rules are the finding constraints written for a model: an AI
 * finding is an interpretation, so it may not assert causation or certainty,
 * and the surface shows the summary verbatim — there is no later pass that
 * softens it.
 */
export const JUDGEMENT_FORMAT_INSTRUCTION = `Answer with JSON only, in this shape:

{"findings":[{"severity":"info|warning|conflict","summary":"one sentence","evidence":[{"entityId":"<id>","where":"where in that object","states":"what it says there"}]}]}

Rules:
- Report only tensions you can point at in the material above. If there are none, answer {"findings":[]}.
- Every "entityId" must be one of the ids listed above; never invent one.
- Give at least two pieces of evidence per finding: a tension has two sides.
- Write the summary as an observation a person still has to judge — "reads as",
  "appears to", "may not line up with". Never claim proof, cause or certainty.
- No prose outside the JSON.`;

/**
 * Reads a model's answer into findings, keeping only what it is allowed to say.
 *
 * Two rules do the work. **Every cited entity must be one that entered the
 * judgement's context**, so a hallucinated, deleted or other-project id cannot
 * reach a row — the same structural scoping `ProjectFacts` gives a
 * deterministic check, applied to the one input a model controls. And a
 * finding still needs `MIN_FINDING_EVIDENCE` sides *after* that filtering, so
 * an item whose second half was invented is dropped rather than shown
 * one-sided.
 *
 * Malformed items are skipped; an answer that is not JSON at all throws,
 * because a scan that cannot read its own judgement must fail visibly rather
 * than report "nothing found" (§8).
 */
export function parseJudgedFindings(
  checkId: string,
  output: string,
  citableEntityIds: ReadonlySet<string>,
): CheckFinding[] {
  const items = readFindingsArray(checkId, output);
  const findings: CheckFinding[] = [];

  for (const item of items) {
    const finding = toCheckFinding(checkId, item, citableEntityIds);
    if (finding) findings.push(finding);
  }

  return findings;
}

function toCheckFinding(
  checkId: string,
  item: unknown,
  citableEntityIds: ReadonlySet<string>,
): CheckFinding | null {
  if (!isRecord(item)) return null;

  const summary = text(item.summary, MAX_FINDING_SUMMARY_LENGTH);
  if (!summary) return null;

  const severity = readSeverity(item.severity);
  const evidence = readEvidence(item.evidence, citableEntityIds);
  if (evidence.length < MIN_FINDING_EVIDENCE) return null;

  // Sorted ids only: a fingerprint carries the objects in tension and never
  // the model's wording, so rescanning the same pair updates one row rather
  // than minting a second (§4.2).
  const cited = [...new Set(evidence.map((piece) => piece.entityId))].sort();

  return {
    fingerprint: fingerprint(checkId, ...cited),
    severity,
    summary,
    evidence,
  };
}

function readEvidence(value: unknown, citableEntityIds: ReadonlySet<string>): FindingEvidence[] {
  if (!Array.isArray(value)) return [];

  const evidence: FindingEvidence[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;

    const entityId = text(raw.entityId, 200);
    if (!entityId || !citableEntityIds.has(entityId)) continue;

    const where = text(raw.where, MAX_FINDING_EVIDENCE_WHERE_LENGTH);
    const states = text(raw.states, MAX_FINDING_EVIDENCE_STATES_LENGTH);
    if (!where || !states) continue;

    evidence.push({ entityId, where, states });
  }
  return evidence;
}

/** Anything unrecognised reads as `warning`: the middle tone, never `conflict`. */
function readSeverity(value: unknown): FindingSeverity {
  return FINDING_SEVERITIES.includes(value as FindingSeverity)
    ? (value as FindingSeverity)
    : 'warning';
}

/**
 * Pulls the JSON object out of the answer.
 *
 * Models fence JSON, prefix it with a sentence, or both, so the outermost
 * braces are what is looked for rather than the whole string being parsed.
 */
function readFindingsArray(checkId: string, output: string): unknown[] {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');

  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(output.slice(start, end + 1));
      if (isRecord(parsed)) return Array.isArray(parsed.findings) ? parsed.findings : [];
    } catch {
      // Falls through to the error below, with the same message either way.
    }
  }

  throw new ValidationError(`The ${checkId} judgement could not be read as JSON`, {
    checkId,
    output: output.slice(0, 500),
  });
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
