import { describe, expect, it } from 'vitest';

import { type Parameter } from '../parameter/parameter';
import { parameterDifferences } from './parameter-differences';

const drain: Parameter = {
  id: 'oxygen-drain',
  label: 'Oxygen drain',
  type: 'range',
  value: 120,
  min: 0,
  max: 240,
  step: 1,
  units: 's',
};

const sprint: Parameter = {
  id: 'sprint-allowed',
  label: 'Sprinting allowed',
  type: 'boolean',
  value: true,
};

const damage: Parameter = {
  id: 'damage-model',
  label: 'Damage model',
  type: 'enum',
  value: 'ironman',
  options: [
    { value: 'ironman', label: 'Ironman' },
    { value: 'forgiving', label: 'Forgiving' },
  ],
};

describe('parameter differences', () => {
  it('reads a tuning change as the values a designer typed', () => {
    expect(parameterDifferences([drain], [{ ...drain, value: 90 }])).toEqual([
      {
        key: 'oxygen-drain',
        label: 'Oxygen drain',
        change: 'changed',
        from: '120 s',
        to: '90 s',
      },
    ]);
  });

  it('pairs parameters on their stable id, not their position or their label', () => {
    const renamedAndMoved = [
      { ...sprint, value: false },
      { ...drain, label: 'Air drain', value: 90 },
    ];

    expect(parameterDifferences([drain, sprint], renamedAndMoved)).toEqual([
      {
        key: 'sprint-allowed',
        label: 'Sprinting allowed',
        change: 'changed',
        from: 'On',
        to: 'Off',
      },
      { key: 'oxygen-drain', label: 'Air drain', change: 'changed', from: '120 s', to: '90 s' },
    ]);
  });

  it('reports a rename on its own when the value held still', () => {
    expect(parameterDifferences([drain], [{ ...drain, label: 'Air drain' }])).toEqual([
      {
        key: 'oxygen-drain:label',
        label: 'Air drain',
        change: 'changed',
        from: 'Oxygen drain',
        to: 'Air drain',
      },
    ]);
  });

  it('names an enum by its option label rather than its stored value', () => {
    expect(parameterDifferences([damage], [{ ...damage, value: 'forgiving' }])).toEqual([
      {
        key: 'damage-model',
        label: 'Damage model',
        change: 'changed',
        from: 'Ironman',
        to: 'Forgiving',
      },
    ]);
  });

  it('reports parameters added and removed', () => {
    expect(parameterDifferences([drain], [drain, sprint])).toEqual([
      { key: 'sprint-allowed', label: 'Sprinting allowed', change: 'added', from: null, to: 'On' },
    ]);

    expect(parameterDifferences([drain, sprint], [drain])).toEqual([
      {
        key: 'sprint-allowed',
        label: 'Sprinting allowed',
        change: 'removed',
        from: 'On',
        to: null,
      },
    ]);
  });

  it('says nothing about bounds that moved under a value that did not', () => {
    expect(parameterDifferences([drain], [{ ...drain, max: 600 }])).toEqual([]);
  });
});
