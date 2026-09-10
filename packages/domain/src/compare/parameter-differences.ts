import { formatParameterValue, type Parameter } from '../parameter/parameter';
import { type Difference } from './difference';

/**
 * What moved between two tunings of the same design.
 *
 * Parameters are matched on their `id`, which is minted once from the label
 * and never recomputed — so reordering the list, renaming a parameter or
 * moving it to another group all leave the pairing alone, and a designer sees
 * `120 s → 90 s` rather than one list replacing another.
 *
 * Only what a designer reads is reported: the value, and the name when the
 * value held still. Moving a slider's bounds without moving its value is an
 * edit to the control, not to the design.
 */
export function parameterDifferences(
  from: readonly Parameter[],
  to: readonly Parameter[],
): Difference[] {
  const before = new Map(from.map((parameter) => [parameter.id, parameter]));
  const after = new Map(to.map((parameter) => [parameter.id, parameter]));
  const differences: Difference[] = [];

  for (const parameter of to) {
    const previous = before.get(parameter.id);

    if (!previous) {
      differences.push({
        key: parameter.id,
        label: parameter.label,
        change: 'added',
        from: null,
        to: formatParameterValue(parameter),
      });
      continue;
    }

    const fromValue = formatParameterValue(previous);
    const toValue = formatParameterValue(parameter);

    if (fromValue !== toValue) {
      differences.push({
        key: parameter.id,
        label: parameter.label,
        change: 'changed',
        from: fromValue,
        to: toValue,
      });
    } else if (previous.label !== parameter.label) {
      differences.push({
        key: `${parameter.id}:label`,
        label: parameter.label,
        change: 'changed',
        from: previous.label,
        to: parameter.label,
      });
    }
  }

  for (const parameter of from) {
    if (after.has(parameter.id)) continue;
    differences.push({
      key: parameter.id,
      label: parameter.label,
      change: 'removed',
      from: formatParameterValue(parameter),
      to: null,
    });
  }

  return differences;
}
