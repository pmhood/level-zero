/**
 * How two entities relate.
 *
 * Edges are directional and read source-first: `A contains B`, `A inspired_by B`,
 * `A promoted_to B`.
 */
export const RELATION_TYPES = [
  'contains',
  'references',
  'inspired_by',
  'generated_from',
  'derived_from',
  'promoted_to',
  'depends_on',
  'implements',
  'appears_in',
  'belongs_to',
  'replaces',
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

/**
 * Relations that record *how something came to exist*.
 *
 * These are history rather than opinion: once a mechanic was promoted from an
 * idea, or a concept generated from a set of references, that stays true. They
 * are not removable, while structural links (`contains`, `references`, ...)
 * describe a current arrangement and can be edited freely.
 */
export const LINEAGE_RELATION_TYPES = [
  'inspired_by',
  'generated_from',
  'derived_from',
  'promoted_to',
  'replaces',
] as const satisfies readonly RelationType[];

export type LineageRelationType = (typeof LINEAGE_RELATION_TYPES)[number];

export function isRelationType(value: unknown): value is RelationType {
  return typeof value === 'string' && (RELATION_TYPES as readonly string[]).includes(value);
}

export function isLineageRelation(relation: RelationType): relation is LineageRelationType {
  return (LINEAGE_RELATION_TYPES as readonly string[]).includes(relation);
}
