import { type Entity } from '../entity/entity';

/**
 * A tuned number, switch or choice — the structured, adjustable side of a
 * design that prose cannot hold: base oxygen capacity, drain multiplier,
 * whether sprinting is allowed, which damage model applies.
 *
 * Parameters live in the entity's `data` like every other type-specific field,
 * so tuning is versioned, branched, compared and restored by the ordinary
 * entity machinery rather than a parallel store of its own. The shape is here,
 * in the framework-free package, because mechanics are not the only thing that
 * will hold one: prototypes and playtest records refer to the same parameters,
 * and they refer to them by `id`.
 */
export interface Parameter {
  /**
   * Stable identity, and the only thing anything outside this list should hold
   * onto. Minted once from the label by `parameterId` and never recomputed, so
   * renaming a parameter, reordering the list, or editing its bounds all leave
   * it alone.
   */
  id: string;
  label: string;
  type: ParameterType;
  value: ParameterValue;
  description?: string;
  /** Free-text category the editor and the summary group rows under. */
  group?: string;
  /** What the number means: `s`, `m/s`, `coins`. Fixed to `%` for a percentage. */
  units?: string;
  min?: number;
  max?: number;
  step?: number;
  /** `enum` only: the choices, in the order they are offered. */
  options?: ParameterOption[];
}

/**
 * The five kinds of parameter.
 *
 * `number`, `range` and `percentage` all store a plain number and differ only
 * in how they are presented: a `number` is a quantity that stands on its own
 * and may or may not be bounded; a `range` is a quantity that only means
 * something between a floor and a ceiling, so it requires both and earns a
 * slider; a `percentage` is a `range` whose units are `%` and whose bounds
 * default to 0–100. Nothing about storage or validation separates them.
 */
export const PARAMETER_TYPES = ['number', 'range', 'percentage', 'boolean', 'enum'] as const;

export type ParameterType = (typeof PARAMETER_TYPES)[number];

export type ParameterValue = number | boolean | string;

/** One choice of an `enum` parameter. `value` is stored; `label` is shown. */
export interface ParameterOption {
  value: string;
  label: string;
}

/** Field of an entity's `data` the parameter list lives in. */
export const TUNING_PARAMETERS_KEY = 'tuningParameters';

/** The units of a `percentage`, which does not carry its own. */
export const PERCENT_UNITS = '%';

const PERCENT_BOUNDS = { min: 0, max: 100 } as const;

export function isParameterType(value: unknown): value is ParameterType {
  return typeof value === 'string' && (PARAMETER_TYPES as readonly string[]).includes(value);
}

export function isNumericParameter(parameter: Parameter): boolean {
  return (
    parameter.type === 'number' || parameter.type === 'range' || parameter.type === 'percentage'
  );
}

/**
 * Mints the key a new parameter — or one of an enum's options — keeps for
 * life, from the label it is born with and the keys already spoken for
 * alongside it.
 *
 * Readable on purpose: a simulation config or a playtest record referring to
 * `base-oxygen-capacity` is worth more than one referring to an opaque token,
 * and this is the only moment the label and the id are ever connected.
 * Recreating a deleted parameter under its old label therefore re-adopts its
 * old id — the parameter comes back rather than arriving as a stranger.
 */
export function parameterId(label: string, taken: readonly string[] = []): string {
  const base = slug(label) || 'parameter';
  if (!taken.includes(base)) return base;

  let suffix = 2;
  while (taken.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export interface CreateParameterInput {
  label: string;
  type: ParameterType;
  /** Ids already used by the list this parameter is joining. */
  taken?: readonly string[];
}

/** A new parameter of `type`, with defaults that are valid the moment it exists. */
export function createParameter({ label, type, taken = [] }: CreateParameterInput): Parameter {
  const base = { id: parameterId(label, taken), label: label.trim(), type };

  switch (type) {
    case 'number':
      return { ...base, type, value: 0 };
    case 'range':
      return { ...base, type, value: 0, min: 0, max: 100, step: 1 };
    case 'percentage':
      return { ...base, type, value: 0, min: 0, max: 100, step: 1, units: PERCENT_UNITS };
    case 'boolean':
      return { ...base, type, value: false };
    case 'enum':
      return {
        ...base,
        type,
        value: 'option-1',
        options: [{ value: 'option-1', label: 'Option 1' }],
      };
  }
}

/**
 * Reads the parameter list out of an entity's `data`.
 *
 * Forgiving in the same way `documentContent` is: `data` is schemaless, so a
 * mechanic promoted from an idea, imported from a spreadsheet or drafted by a
 * model has to open in the editor rather than fail in it. Anything unusable is
 * dropped and everything else — including a value the bounds no longer contain
 * — is carried through exactly as stored, because clamping on read would
 * destroy the very edit the editor is there to let someone make.
 */
export function readParameters(source: Pick<Entity, 'data'>): Parameter[] {
  const stored = source.data[TUNING_PARAMETERS_KEY];
  if (!Array.isArray(stored)) return [];

  const parameters: Parameter[] = [];
  const taken: string[] = [];

  for (const raw of stored) {
    const parameter = readParameter(raw, taken);
    if (!parameter) continue;
    taken.push(parameter.id);
    parameters.push(parameter);
  }
  return parameters;
}

function readParameter(raw: unknown, taken: readonly string[]): Parameter | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;
  const label = typeof record.label === 'string' ? record.label : '';
  const type = isParameterType(record.type) ? record.type : null;
  if (!type || label.trim().length === 0) return null;

  const id =
    typeof record.id === 'string' && record.id.length > 0 ? record.id : parameterId(label, taken);
  if (taken.includes(id)) return null;

  const options = type === 'enum' ? readOptions(record.options) : undefined;
  const parameter: Parameter = { id, label, type, value: readValue(record.value, type, options) };

  if (typeof record.description === 'string') parameter.description = record.description;
  if (typeof record.group === 'string') parameter.group = record.group;
  if (typeof record.units === 'string') parameter.units = record.units;
  if (Number.isFinite(record.min)) parameter.min = record.min as number;
  if (Number.isFinite(record.max)) parameter.max = record.max as number;
  if (Number.isFinite(record.step)) parameter.step = record.step as number;
  if (options) parameter.options = options;

  return parameter;
}

function readValue(
  value: unknown,
  type: ParameterType,
  options: ParameterOption[] | undefined,
): ParameterValue {
  if (type === 'boolean') return value === true;
  if (type === 'enum') return typeof value === 'string' ? value : (options?.[0]?.value ?? '');
  return Number.isFinite(value) ? (value as number) : 0;
}

function readOptions(value: unknown): ParameterOption[] {
  if (!Array.isArray(value)) return [];

  const options: ParameterOption[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const option = raw as Record<string, unknown>;
    if (typeof option.value !== 'string' || option.value.length === 0) continue;
    if (options.some((existing) => existing.value === option.value)) continue;
    options.push({
      value: option.value,
      label:
        typeof option.label === 'string' && option.label.length > 0 ? option.label : option.value,
    });
  }
  return options;
}

/**
 * The floor and ceiling a value is held between, or `null` where the parameter
 * does not impose one.
 *
 * A percentage that was never given bounds gets 0–100 here rather than at
 * creation, so a stored parameter and a freshly made one behave the same.
 */
export function parameterBounds(parameter: Parameter): { min: number | null; max: number | null } {
  if (!isNumericParameter(parameter)) return { min: null, max: null };

  if (parameter.type === 'percentage') {
    return { min: parameter.min ?? PERCENT_BOUNDS.min, max: parameter.max ?? PERCENT_BOUNDS.max };
  }
  return { min: parameter.min ?? null, max: parameter.max ?? null };
}

/**
 * Problems with how the parameter is *defined* — the things that make it
 * impossible to tune at all, and which a form should refuse to save.
 *
 * Deliberately says nothing about the value: see `parameterValueIssue`.
 */
export function parameterDefinitionIssues(parameter: Parameter): string[] {
  const issues: string[] = [];

  if (parameter.label.trim().length === 0) issues.push('Needs a label.');

  const { min, max } = parameterBounds(parameter);
  if (parameter.type === 'range' && (min === null || max === null)) {
    issues.push('A range needs both a minimum and a maximum.');
  }
  if (min !== null && max !== null && min > max) {
    issues.push('The minimum must not be above the maximum.');
  }
  if (parameter.step !== undefined && parameter.step <= 0) {
    issues.push('The step must be greater than zero.');
  }
  if (parameter.type === 'enum' && (parameter.options?.length ?? 0) === 0) {
    issues.push('Needs at least one option.');
  }

  return issues;
}

/**
 * What is wrong with the value itself, if anything — almost always a value
 * that was fine until someone moved the bounds or removed an option under it.
 *
 * Reported rather than corrected. The stored value is the number somebody
 * chose, and silently rewriting it is how tuning history stops meaning
 * anything; the control shows this and the next edit clamps.
 */
export function parameterValueIssue(parameter: Parameter): string | null {
  if (parameter.type === 'boolean') return null;

  if (parameter.type === 'enum') {
    const options = parameter.options ?? [];
    if (typeof parameter.value !== 'string' || !options.some((o) => o.value === parameter.value)) {
      return 'This value is no longer one of the options.';
    }
    return null;
  }

  if (typeof parameter.value !== 'number' || !Number.isFinite(parameter.value)) {
    return 'This value is not a number.';
  }

  const { min, max } = parameterBounds(parameter);
  if (min !== null && parameter.value < min)
    return `Below the minimum of ${formatNumber(min, parameter)}.`;
  if (max !== null && parameter.value > max)
    return `Above the maximum of ${formatNumber(max, parameter)}.`;
  return null;
}

/**
 * Brings a raw number onto the parameter's step and inside its bounds.
 *
 * Applied when someone commits an edit, not when a value is read, so an
 * existing out-of-bounds value survives until it is actually touched.
 */
export function clampParameterValue(parameter: Parameter, value: number): number {
  if (!Number.isFinite(value)) return typeof parameter.value === 'number' ? parameter.value : 0;

  const { min, max } = parameterBounds(parameter);
  let next = value;

  if (parameter.step !== undefined && parameter.step > 0) {
    const origin = min ?? 0;
    next = roundLike(
      origin + Math.round((next - origin) / parameter.step) * parameter.step,
      parameter.step,
    );
  }
  if (min !== null && next < min) next = min;
  if (max !== null && next > max) next = max;
  return next;
}

/**
 * The value on its own, the way a summary row, an embed or a compare column
 * shows it: `120 s`, `35%`, `On`, `Ironman`.
 */
export function formatParameterValue(parameter: Parameter): string {
  if (parameter.type === 'boolean') return parameter.value === true ? 'On' : 'Off';

  if (parameter.type === 'enum') {
    if (typeof parameter.value !== 'string' || parameter.value.length === 0) return '—';
    const option = (parameter.options ?? []).find((o) => o.value === parameter.value);
    return option?.label ?? parameter.value;
  }

  if (typeof parameter.value !== 'number' || !Number.isFinite(parameter.value)) return '—';
  return formatNumber(parameter.value, parameter);
}

function formatNumber(value: number, parameter: Parameter): string {
  if (parameter.type === 'percentage') return `${value}${PERCENT_UNITS}`;
  return parameter.units ? `${value} ${parameter.units}` : `${value}`;
}

export interface ParameterGroup {
  /** `null` for the parameters that were never filed under a category. */
  name: string | null;
  parameters: Parameter[];
}

/**
 * Splits a list into its categories, in the order each first appears, so the
 * editor and the read-only summary agree on the shape without either owning
 * the rule.
 */
export function groupParameters(parameters: readonly Parameter[]): ParameterGroup[] {
  const groups: ParameterGroup[] = [];

  for (const parameter of parameters) {
    const name = parameter.group?.trim() ? parameter.group.trim() : null;
    const group = groups.find((candidate) => candidate.name === name);
    if (group) group.parameters.push(parameter);
    else groups.push({ name, parameters: [parameter] });
  }
  return groups;
}

/** Keeps a stepped value off floating-point noise like `0.30000000000000004`. */
function roundLike(value: number, step: number): number {
  const decimals = String(step).split('.')[1]?.length ?? 0;
  return decimals > 0 ? Number(value.toFixed(decimals)) : value;
}

function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}
