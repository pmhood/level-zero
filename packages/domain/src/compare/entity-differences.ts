import { DOCUMENT_CONTENT_KEY, documentContent } from '../document/document';
import { type EntitySnapshot } from '../entity/entity';
import { TUNING_PARAMETERS_KEY, readParameters } from '../parameter/parameter';
import { diffSnapshots, type FieldChange } from '../version/compare';
import {
  changeOf,
  describeValue,
  fieldLabel,
  type Difference,
  type DifferenceGroup,
} from './difference';
import { documentDifferences } from './document-differences';
import { parameterDifferences } from './parameter-differences';

/** Everything that is not tuning or prose: name, status, tags, `data` fields. */
export const DETAILS_GROUP = 'Details';
export const TUNING_GROUP = 'Tuning';
export const WRITING_GROUP = 'Writing';

const TUNING_FIELD = `data.${TUNING_PARAMETERS_KEY}`;
const CONTENT_FIELD = `data.${DOCUMENT_CONTENT_KEY}`;

/**
 * What changed between two versions of an entity, in the words of whatever the
 * entity actually holds.
 *
 * One adapter serves every entity-backed target because the entity model is
 * one table: a character, a location and a game design document differ in
 * which `data` fields they carry, not in what a version of them is. The two
 * fields with a meaning of their own — the tuning parameters a mechanic is
 * built from and the body of a document — are handed to the modules that own
 * them, so they read as `120 s → 90 s` and as rewritten paragraphs rather than
 * as two opaque blobs. Everything else is described field by field.
 */
export function entityVersionDifferences(
  from: EntitySnapshot,
  to: EntitySnapshot,
): DifferenceGroup[] {
  const details: Difference[] = [];
  const groups: DifferenceGroup[] = [];

  for (const change of diffSnapshots(from, to)) {
    if (change.field === TUNING_FIELD) {
      const differences = parameterDifferences(readParameters(from), readParameters(to));
      if (differences.length > 0) {
        groups.push({ title: TUNING_GROUP, differences });
        continue;
      }
    }

    if (change.field === CONTENT_FIELD) {
      const differences = documentDifferences(documentContent(from), documentContent(to));
      if (differences.length > 0) {
        groups.push({ title: WRITING_GROUP, differences });
        continue;
      }
    }

    // Including the two fields above when their own reading found nothing to
    // report — the stored shape moved without the design or the prose moving.
    // Saying "this changed, vaguely" beats saying nothing changed.
    const row = describeChange(change);
    if (row) details.push(row);
  }

  return details.length > 0 ? [{ title: DETAILS_GROUP, differences: details }, ...groups] : groups;
}

function describeChange(change: FieldChange): Difference | null {
  const from = describeValue(change.from);
  const to = describeValue(change.to);
  if (from === null && to === null) return null;

  return {
    key: change.field,
    label: fieldLabel(change.field),
    change: changeOf(from, to),
    from,
    to,
  };
}
