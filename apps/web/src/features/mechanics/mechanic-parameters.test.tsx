// @vitest-environment jsdom
import type { Parameter } from '@level-zero/domain';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { MechanicParameters } from './mechanic-parameters';

const capacity: Parameter = {
  id: 'base-oxygen-capacity',
  label: 'Base Oxygen Capacity',
  type: 'range',
  value: 120,
  units: 's',
  min: 60,
  max: 240,
  step: 5,
};

/** The editor is controlled by the detail form's draft, so a test holds one too. */
function Editor({ initial = [] as Parameter[] }) {
  const [parameters, setParameters] = useState(initial);

  return (
    <>
      <MechanicParameters parameters={parameters} onChange={setParameters} />
      <pre data-testid="draft">{JSON.stringify(parameters)}</pre>
    </>
  );
}

function draft(): Parameter[] {
  return JSON.parse(screen.getByTestId('draft').textContent ?? '[]');
}

function add(label: string, type: string) {
  fireEvent.change(screen.getByLabelText('New parameter'), { target: { value: label } });
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: type } });
  fireEvent.click(screen.getByRole('button', { name: 'Add parameter' }));
}

describe('MechanicParameters', () => {
  afterEach(cleanup);

  it('invites a first parameter rather than showing an empty list', () => {
    render(<Editor />);

    expect(screen.getByText(/No parameters yet/)).toBeDefined();
  });

  it('defines a parameter of every supported type', () => {
    render(<Editor />);

    add('Base Oxygen Capacity', 'range');
    add('Sprint drain', 'number');
    add('Crit chance', 'percentage');
    add('Allow sprinting', 'boolean');
    add('Damage model', 'enum');

    expect(draft().map((parameter) => [parameter.id, parameter.type])).toEqual([
      ['base-oxygen-capacity', 'range'],
      ['sprint-drain', 'number'],
      ['crit-chance', 'percentage'],
      ['allow-sprinting', 'boolean'],
      ['damage-model', 'enum'],
    ]);
  });

  it('gives two parameters with the same label ids of their own', () => {
    render(<Editor />);

    add('Capacity', 'number');
    add('Capacity', 'number');

    expect(draft().map((parameter) => parameter.id)).toEqual(['capacity', 'capacity-2']);
  });

  it('tunes a value by direct entry, not only by the slider', () => {
    render(<Editor initial={[capacity]} />);

    fireEvent.change(screen.getByLabelText('Base Oxygen Capacity'), { target: { value: '180' } });

    expect(draft()[0]?.value).toBe(180);
    expect(screen.getByText('180 s')).toBeDefined();
  });

  it('keeps the id when the label is renamed, because everything else holds the id', () => {
    render(<Editor initial={[capacity]} />);

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Tank capacity' } });

    expect(draft()[0]?.id).toBe('base-oxygen-capacity');
    expect(draft()[0]?.label).toBe('Tank capacity');
  });

  it('edits bounds, units and category, and drops the ones left blank', () => {
    render(<Editor initial={[capacity]} />);

    fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Oxygen' } });
    fireEvent.change(screen.getByLabelText('Units'), { target: { value: '' } });

    const [parameter] = draft();
    expect(parameter?.max).toBe(300);
    expect(parameter?.group).toBe('Oxygen');
    expect(parameter && 'units' in parameter).toBe(false);
  });

  it('warns rather than clamps when the bounds move out from under a value', () => {
    render(<Editor initial={[capacity]} />);

    fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '90' } });

    expect(draft()[0]?.value).toBe(120);
    expect(screen.getByText('Above the maximum of 90 s.')).toBeDefined();
  });

  it('flags a definition nobody could tune', () => {
    render(<Editor initial={[capacity]} />);

    fireEvent.change(screen.getByLabelText('Minimum'), { target: { value: '' } });

    expect(screen.getByText('A range needs both a minimum and a maximum.')).toBeDefined();
  });

  it('adds and renames enum options without orphaning the stored value', () => {
    render(<Editor />);
    add('Damage model', 'enum');

    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'Ironman' } });
    fireEvent.change(screen.getByLabelText('Damage model'), { target: { value: 'option-2' } });
    fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'Forgiving' } });

    const [parameter] = draft();
    expect(parameter?.options).toEqual([
      { value: 'option-1', label: 'Forgiving' },
      { value: 'option-2', label: 'Ironman' },
    ]);
    expect(parameter?.value).toBe('option-2');
  });

  it('groups the list by category', () => {
    render(
      <Editor
        initial={[
          { ...capacity, group: 'Oxygen' },
          { id: 'cost', label: 'Repair cost', type: 'number', value: 40, group: 'Economy' },
        ]}
      />,
    );

    expect(screen.getByText('Oxygen')).toBeDefined();
    expect(screen.getByText('Economy')).toBeDefined();
  });

  it('removes a parameter', () => {
    render(<Editor initial={[capacity]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Base Oxygen Capacity' }));

    expect(draft()).toEqual([]);
  });
});
