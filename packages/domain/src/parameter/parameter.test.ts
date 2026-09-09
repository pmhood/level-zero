import { describe, expect, it } from 'vitest';

import { snapshotEntity, type Entity } from '../entity/entity';
import { diffSnapshots } from '../version/compare';
import {
  PARAMETER_TYPES,
  TUNING_PARAMETERS_KEY,
  clampParameterValue,
  createParameter,
  formatParameterValue,
  groupParameters,
  parameterBounds,
  parameterDefinitionIssues,
  parameterId,
  parameterValueIssue,
  readParameters,
  type Parameter,
} from './parameter';

function entity(parameters: unknown, rest: Record<string, unknown> = {}): Entity {
  return {
    id: 'ent_1',
    projectId: 'prj_1',
    type: 'mechanic',
    name: 'Oxygen management',
    description: null,
    status: 'draft',
    tags: [],
    data: { ...rest, [TUNING_PARAMETERS_KEY]: parameters },
    currentVersionId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    archivedAt: null,
  };
}

const capacity: Parameter = {
  id: 'base-oxygen-capacity',
  label: 'Base Oxygen Capacity',
  type: 'range',
  value: 120,
  units: 's',
  min: 60,
  max: 240,
  step: 5,
  group: 'Oxygen',
  description: 'How long a full tank lasts standing still.',
};

describe('parameterId', () => {
  it('reads as the name it was born with', () => {
    expect(parameterId('Base Oxygen Capacity')).toBe('base-oxygen-capacity');
    expect(parameterId('Drain × 2 (sprinting)')).toBe('drain-2-sprinting');
    expect(parameterId('Coût de réparation')).toBe('cout-de-reparation');
  });

  it('never collides with an id the list already holds', () => {
    expect(parameterId('Capacity', ['capacity'])).toBe('capacity-2');
    expect(parameterId('Capacity', ['capacity', 'capacity-2'])).toBe('capacity-3');
  });

  it('falls back rather than minting an empty id', () => {
    expect(parameterId('———')).toBe('parameter');
  });
});

describe('createParameter', () => {
  it('produces a parameter of every type that is valid the moment it exists', () => {
    for (const type of PARAMETER_TYPES) {
      const parameter = createParameter({ label: 'Tuning knob', type });

      expect(parameter.id).toBe('tuning-knob');
      expect(parameter.type).toBe(type);
      expect(parameterDefinitionIssues(parameter)).toEqual([]);
      expect(parameterValueIssue(parameter)).toBeNull();
    }
  });

  it('gives a percentage its units and its 0–100 bounds', () => {
    const parameter = createParameter({ label: 'Crit chance', type: 'percentage' });

    expect(parameter.units).toBe('%');
    expect(parameterBounds(parameter)).toEqual({ min: 0, max: 100 });
  });

  it('takes an id the list has not spoken for', () => {
    const parameter = createParameter({ label: 'Capacity', type: 'number', taken: ['capacity'] });

    expect(parameter.id).toBe('capacity-2');
  });
});

describe('readParameters', () => {
  it('round-trips every type without losing units, bounds, options or identity', () => {
    const stored: Parameter[] = [
      capacity,
      { id: 'sprint-drain', label: 'Sprint drain', type: 'number', value: 2.5, units: 'x' },
      {
        id: 'crit-chance',
        label: 'Crit chance',
        type: 'percentage',
        value: 35,
        units: '%',
        min: 0,
        max: 100,
        step: 5,
      },
      { id: 'allow-sprint', label: 'Allow sprinting', type: 'boolean', value: true },
      {
        id: 'damage-model',
        label: 'Damage model',
        type: 'enum',
        value: 'ironman',
        options: [
          { value: 'forgiving', label: 'Forgiving' },
          { value: 'ironman', label: 'Ironman' },
        ],
      },
    ];

    expect(readParameters(entity(stored))).toEqual(stored);
  });

  it('survives the JSON round trip the API and the database put data through', () => {
    const source = entity([capacity]);
    const revived = entity(JSON.parse(JSON.stringify(source.data))[TUNING_PARAMETERS_KEY]);

    expect(readParameters(revived)).toEqual([capacity]);
  });

  it('reads an entity with no parameters at all — a mechanic promoted from an idea', () => {
    expect(readParameters({ data: {} })).toEqual([]);
    expect(readParameters(entity('not a list'))).toEqual([]);
  });

  it('drops what it cannot use and keeps the rest', () => {
    const read = readParameters(
      entity([
        { id: 'ok', label: 'Fine', type: 'number', value: 3 },
        { id: 'no-type', label: 'Missing a type', value: 1 },
        { id: 'no-label', label: '  ', type: 'number', value: 1 },
        'not an object',
        { id: 'ok', label: 'A duplicate id', type: 'number', value: 9 },
      ]),
    );

    expect(read).toEqual([{ id: 'ok', label: 'Fine', type: 'number', value: 3 }]);
  });

  it('mints an id for a parameter that arrived without one', () => {
    const read = readParameters(
      entity([
        { label: 'Base Oxygen Capacity', type: 'number', value: 120 },
        { label: 'Base Oxygen Capacity', type: 'number', value: 90 },
      ]),
    );

    expect(read.map((parameter) => parameter.id)).toEqual([
      'base-oxygen-capacity',
      'base-oxygen-capacity-2',
    ]);
  });

  it('keeps a value the bounds no longer contain rather than clamping it away', () => {
    const [read] = readParameters(entity([{ ...capacity, value: 900 }]));

    expect(read?.value).toBe(900);
    expect(parameterValueIssue(read as Parameter)).toBe('Above the maximum of 240 s.');
  });

  it('coerces a value `data` cannot constrain to its type', () => {
    const read = readParameters(
      entity([
        { id: 'a', label: 'A', type: 'number', value: 'not a number' },
        { id: 'b', label: 'B', type: 'boolean', value: 'yes' },
        { id: 'c', label: 'C', type: 'enum', value: 7, options: [{ value: 'x', label: 'X' }] },
      ]),
    );

    expect(read.map((parameter) => parameter.value)).toEqual([0, false, 'x']);
  });

  it('drops option entries that carry no stored value, and labels the rest', () => {
    const [read] = readParameters(
      entity([
        {
          id: 'model',
          label: 'Model',
          type: 'enum',
          value: 'a',
          options: [{ value: 'a' }, { label: 'no value' }, { value: 'a', label: 'duplicate' }],
        },
      ]),
    );

    expect(read?.options).toEqual([{ value: 'a', label: 'a' }]);
  });
});

describe('parameterBounds', () => {
  it('gives a percentage 0–100 even when it was stored without bounds', () => {
    expect(parameterBounds({ id: 'p', label: 'P', type: 'percentage', value: 10 })).toEqual({
      min: 0,
      max: 100,
    });
  });

  it('leaves a plain number unbounded', () => {
    expect(parameterBounds({ id: 'n', label: 'N', type: 'number', value: 10 })).toEqual({
      min: null,
      max: null,
    });
  });
});

describe('parameterDefinitionIssues', () => {
  it('accepts a well-formed parameter', () => {
    expect(parameterDefinitionIssues(capacity)).toEqual([]);
  });

  it('rejects a range without both ends', () => {
    expect(parameterDefinitionIssues({ ...capacity, max: undefined })).toEqual([
      'A range needs both a minimum and a maximum.',
    ]);
  });

  it('rejects inverted bounds, a non-positive step, a blank label and an empty option list', () => {
    expect(parameterDefinitionIssues({ ...capacity, min: 300 })).toContain(
      'The minimum must not be above the maximum.',
    );
    expect(parameterDefinitionIssues({ ...capacity, step: 0 })).toContain(
      'The step must be greater than zero.',
    );
    expect(parameterDefinitionIssues({ ...capacity, label: '   ' })).toContain('Needs a label.');
    expect(
      parameterDefinitionIssues({ id: 'e', label: 'E', type: 'enum', value: '', options: [] }),
    ).toContain('Needs at least one option.');
  });
});

describe('parameterValueIssue', () => {
  it('says nothing about a value inside its bounds', () => {
    expect(parameterValueIssue(capacity)).toBeNull();
    expect(parameterValueIssue({ ...capacity, value: 60 })).toBeNull();
    expect(parameterValueIssue({ ...capacity, value: 240 })).toBeNull();
  });

  it('reports a value the bounds moved out from under', () => {
    expect(parameterValueIssue({ ...capacity, value: 30 })).toBe('Below the minimum of 60 s.');
    expect(parameterValueIssue({ ...capacity, min: 150 })).toBe('Below the minimum of 150 s.');
  });

  it('reports an enum value whose option was removed', () => {
    const parameter: Parameter = {
      id: 'model',
      label: 'Model',
      type: 'enum',
      value: 'ironman',
      options: [{ value: 'forgiving', label: 'Forgiving' }],
    };

    expect(parameterValueIssue(parameter)).toBe('This value is no longer one of the options.');
  });

  it('never complains about a boolean', () => {
    expect(parameterValueIssue({ id: 'b', label: 'B', type: 'boolean', value: false })).toBeNull();
  });
});

describe('clampParameterValue', () => {
  it('holds a value between the bounds', () => {
    expect(clampParameterValue(capacity, 900)).toBe(240);
    expect(clampParameterValue(capacity, -5)).toBe(60);
    expect(clampParameterValue(capacity, 125)).toBe(125);
  });

  it('snaps onto the step, measured from the minimum', () => {
    expect(clampParameterValue(capacity, 123)).toBe(125);
    expect(clampParameterValue(capacity, 121)).toBe(120);
  });

  it('keeps a fractional step off floating-point noise', () => {
    const parameter: Parameter = { id: 'd', label: 'D', type: 'number', value: 0, step: 0.1 };

    expect(clampParameterValue(parameter, 0.30000000000000004)).toBe(0.3);
    expect(clampParameterValue(parameter, 2.24)).toBe(2.2);
  });

  it('leaves an unbounded number alone', () => {
    expect(clampParameterValue({ id: 'n', label: 'N', type: 'number', value: 0 }, -1000)).toBe(
      -1000,
    );
  });

  it('falls back to the stored value when handed something that is not a number', () => {
    expect(clampParameterValue(capacity, Number.NaN)).toBe(120);
  });
});

describe('formatParameterValue', () => {
  it('reads the way the parameter is meant to be read', () => {
    expect(formatParameterValue(capacity)).toBe('120 s');
    expect(
      formatParameterValue({ id: 'p', label: 'P', type: 'percentage', value: 35, units: '%' }),
    ).toBe('35%');
    expect(formatParameterValue({ id: 'n', label: 'N', type: 'number', value: 2.5 })).toBe('2.5');
    expect(formatParameterValue({ id: 'b', label: 'B', type: 'boolean', value: true })).toBe('On');
    expect(formatParameterValue({ id: 'b', label: 'B', type: 'boolean', value: false })).toBe(
      'Off',
    );
  });

  it('shows an enum by its label, and falls back to the stored value', () => {
    const options = [{ value: 'ironman', label: 'Ironman' }];

    expect(
      formatParameterValue({ id: 'm', label: 'M', type: 'enum', value: 'ironman', options }),
    ).toBe('Ironman');
    expect(
      formatParameterValue({ id: 'm', label: 'M', type: 'enum', value: 'gone', options }),
    ).toBe('gone');
  });
});

describe('groupParameters', () => {
  it('keeps each category in the order it first appears, ungrouped included', () => {
    const loose: Parameter = { id: 'l', label: 'Loose', type: 'number', value: 1 };
    const drain: Parameter = { ...capacity, id: 'drain', label: 'Drain', group: 'Oxygen' };
    const cost: Parameter = { ...capacity, id: 'cost', label: 'Cost', group: 'Economy' };

    expect(groupParameters([capacity, loose, cost, drain])).toEqual([
      { name: 'Oxygen', parameters: [capacity, drain] },
      { name: null, parameters: [loose] },
      { name: 'Economy', parameters: [cost] },
    ]);
  });
});

describe('parameters in entity versions', () => {
  it('show up as an ordinary data change, so compare mode can read them', () => {
    const before = snapshotEntity(entity([capacity]));
    const after = snapshotEntity(entity([{ ...capacity, value: 180 }]));

    expect(diffSnapshots(before, after)).toEqual([
      {
        field: `data.${TUNING_PARAMETERS_KEY}`,
        from: [capacity],
        to: [{ ...capacity, value: 180 }],
      },
    ]);
  });

  it('do not read as changed when only the label moves, because identity is not the label', () => {
    const renamed = { ...capacity, label: 'Tank capacity' };
    const before = snapshotEntity(entity([capacity]));
    const after = snapshotEntity(entity([renamed]));

    const [change] = diffSnapshots(before, after);
    const from = (change?.from as Parameter[])[0];
    const to = (change?.to as Parameter[])[0];

    expect(from?.id).toBe(to?.id);
    expect(from?.value).toBe(to?.value);
  });
});
