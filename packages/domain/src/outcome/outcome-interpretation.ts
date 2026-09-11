import { type DifferenceGroup } from '../compare/difference';
import { type Playtest } from '../playtest/playtest';
import {
  type CategoryGroup,
  type DesignChange,
  type MetricChange,
  type OutcomeComparison,
  type OutcomeSide,
} from './outcome-comparison';

/** How many remarks per theme the briefing quotes before it stops. */
const MAX_QUOTES_PER_THEME = 3;

/** The untagged bucket, named for a reader rather than left as `null`. */
const UNCATEGORIZED = 'uncategorised';

/**
 * The rules a reading of this comparison has to obey, stated once.
 *
 * The load-bearing one is the causal rule. Two versions of a prototype played
 * by different people on different days are not a controlled experiment, and a
 * model asked "did the change do this" will happily answer that it did — which
 * is the one thing #65 forbids. So the instruction names what the evidence can
 * support, and asks for what would have to be tested to know more.
 */
export const INTERPRETATION_FORMAT_INSTRUCTION = `Rules:
- Answer in at most four short paragraphs of plain prose. No headings, no lists, no Markdown.
- Point at which design changes and which measured outcomes moved together, and say plainly where nothing lines up.
- Never claim that a change caused an outcome. These are two sets of playtests, not a controlled experiment: write "moved alongside", "may relate to", "is worth testing", and name what an experiment would have to hold still to know.
- Say when the evidence is too thin to read — a handful of sessions, one side measured more often than the other, or an outcome measured on only one side.
- Do not restate every number back. A designer is reading this beside the figures.`;

/**
 * The comparison as a briefing a model can read.
 *
 * Only recorded facts go in: pinned versions, tuning values, measured numbers
 * and the words people wrote. The reading that comes back is an
 * interpretation, kept as its own `Generation` and shown as one — it never
 * joins these facts.
 */
export function outcomeInterpretationPrompt(comparison: OutcomeComparison): string {
  return [
    'Two versions of the same prototype were captured, and the playtests of each were recorded.',
    'Everything below is measured or written evidence, not analysis.',
    '',
    `A — ${sideHeading(comparison.from)}`,
    `B — ${sideHeading(comparison.to)}`,
    '',
    ...section('Design changes, A to B', comparison.designChanges.map(designChangeLine)),
    ...section('Measured metrics', comparison.metricChanges.map(metricChangeLine)),
    ...section(
      'Participant feedback by category',
      comparison.feedbackThemes.flatMap((theme) => themeLines(theme, (item) => item.body)),
    ),
    ...section(
      'Observations by category',
      comparison.observationThemes.flatMap((theme) => themeLines(theme, (item) => item.body)),
    ),
    INTERPRETATION_FORMAT_INSTRUCTION,
  ].join('\n');
}

function sideHeading(side: OutcomeSide): string {
  const name = side.version.name ? ` "${side.version.name}"` : '';
  return `v${side.version.versionNumber}${name}: ${playtestSummary(side)}`;
}

function playtestSummary(side: OutcomeSide): string {
  if (side.playtests.length === 0) return 'no playtests recorded';

  return [
    `${count(side.playtests.length, 'playtest')} (${side.playtests.map(named).join(', ')})`,
    count(side.sessionCount, 'session'),
  ].join(', ');
}

function named(playtest: Playtest): string {
  return playtest.goal ? `"${playtest.name}" — ${playtest.goal}` : `"${playtest.name}"`;
}

function designChangeLine(change: DesignChange): string {
  const pins =
    change.change === 'added'
      ? `added at v${change.to?.versionNumber ?? '?'}`
      : change.change === 'removed'
        ? `dropped (was v${change.from?.versionNumber ?? '?'})`
        : `v${change.from?.versionNumber ?? '?'} → v${change.to?.versionNumber ?? '?'}`;

  const detail = change.groups.map(groupLine).join('; ');
  return `- "${change.name}" (id: ${change.entityId}) ${pins}${detail ? ` — ${detail}` : ''}`;
}

function groupLine(group: DifferenceGroup): string {
  const rows = group.differences.map(
    (difference) => `${difference.label} ${difference.from ?? '—'} → ${difference.to ?? '—'}`,
  );
  return `${group.title}: ${rows.join(', ')}`;
}

function metricChangeLine(change: MetricChange): string {
  const samples = [
    change.from && `A from ${count(change.from.sampleCount, 'measurement')}`,
    change.to && `B from ${count(change.to.sampleCount, 'measurement')}`,
  ].filter((part): part is string => part !== null);

  const { label, from, to } = change.difference;
  return `- ${label}: ${from ?? 'not measured'} → ${to ?? 'not measured'} (${samples.join(', ')})`;
}

function themeLines<TItem extends { tags: string[] }>(
  theme: CategoryGroup<TItem>,
  body: (item: TItem) => string,
): string[] {
  const category = theme.category ?? UNCATEGORIZED;

  return [
    `- ${category}: ${theme.from.length} on A, ${theme.to.length} on B`,
    ...quotes('A', theme.from, body),
    ...quotes('B', theme.to, body),
  ];
}

function quotes<TItem>(
  side: 'A' | 'B',
  items: readonly TItem[],
  body: (item: TItem) => string,
): string[] {
  return items
    .slice(0, MAX_QUOTES_PER_THEME)
    .map((item) => `  - ${side}: "${body(item).replace(/\s+/g, ' ').trim()}"`);
}

/** A heading and its lines, or nothing at all when there are none. */
function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [`${title}: none recorded.`, ''] : [`${title}:`, ...lines, ''];
}

function count(total: number, noun: string): string {
  return `${total} ${noun}${total === 1 ? '' : 's'}`;
}
