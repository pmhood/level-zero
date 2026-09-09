import type { Parameter } from '@level-zero/domain';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ParameterControl } from './parameter-control';
import { ParameterSummary } from './parameter-summary';

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

/** The control is controlled, so a test that types has to hold the value. */
function Tuner({ initial, onCommit }: { initial: Parameter; onCommit?: (p: Parameter) => void }) {
  const [parameter, setParameter] = useState(initial);

  return (
    <ParameterControl
      parameter={parameter}
      onChange={(next) => {
        setParameter(next);
        onCommit?.(next);
      }}
    />
  );
}

function numberInput(label = 'Base Oxygen Capacity'): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe('ParameterControl', () => {
  it('shows the label, the formatted value and the bounds', () => {
    render(<ParameterControl parameter={capacity} onChange={vi.fn()} />);

    expect(screen.getByText('Base Oxygen Capacity')).toBeDefined();
    expect(screen.getByText('120 s')).toBeDefined();
    expect(screen.getByText('60')).toBeDefined();
    expect(screen.getByText('240')).toBeDefined();
  });

  it('offers direct numeric entry, not only the slider', () => {
    const onCommit = vi.fn();
    render(<Tuner initial={capacity} onCommit={onCommit} />);

    const field = numberInput();
    expect(field.type).toBe('number');

    fireEvent.change(field, { target: { value: '175' } });

    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ value: 175 }));
    expect(screen.getByText('175 s')).toBeDefined();
  });

  it('lets a number be typed through values the bounds would reject', () => {
    render(<Tuner initial={capacity} />);
    const field = numberInput();

    fireEvent.change(field, { target: { value: '1' } });
    expect(field.value).toBe('1');

    fireEvent.change(field, { target: { value: '150' } });
    expect(field.value).toBe('150');
    expect(screen.getByText('150 s')).toBeDefined();
  });

  it('clamps to the bounds and snaps to the step when the field is left', () => {
    render(<Tuner initial={capacity} />);
    const field = numberInput();

    fireEvent.change(field, { target: { value: '900' } });
    fireEvent.blur(field);
    expect(screen.getByText('240 s')).toBeDefined();

    fireEvent.change(field, { target: { value: '123' } });
    fireEvent.blur(field);
    expect(screen.getByText('125 s')).toBeDefined();
  });

  it('drives the same value from the slider', () => {
    render(<Tuner initial={capacity} />);

    fireEvent.change(screen.getByLabelText('Base Oxygen Capacity slider'), {
      target: { value: '200' },
    });

    expect(screen.getByText('200 s')).toBeDefined();
    expect(numberInput().value).toBe('200');
  });

  it('gives an unbounded number a field and no slider', () => {
    const drain: Parameter = { id: 'drain', label: 'Sprint drain', type: 'number', value: 2.5 };
    render(<Tuner initial={drain} />);

    expect(screen.queryByLabelText('Sprint drain slider')).toBeNull();

    const field = numberInput('Sprint drain');
    fireEvent.change(field, { target: { value: '-40' } });
    fireEvent.blur(field);

    expect(screen.getByText('-40')).toBeDefined();
  });

  it('renders a percentage against its implied 0–100 bounds', () => {
    const crit: Parameter = { id: 'crit', label: 'Crit chance', type: 'percentage', value: 35 };
    render(<ParameterControl parameter={crit} onChange={vi.fn()} />);

    expect(screen.getByText('35%')).toBeDefined();
    const slider = screen.getByLabelText('Crit chance slider') as HTMLInputElement;
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('100');
  });

  it('toggles a boolean', () => {
    const allow: Parameter = {
      id: 'allow',
      label: 'Allow sprinting',
      type: 'boolean',
      value: false,
    };
    render(<Tuner initial={allow} />);

    expect(screen.getByText('Off')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Allow sprinting'));
    expect(screen.getByText('On')).toBeDefined();
  });

  it('offers the enum options and stores the option value, not its label', () => {
    const onCommit = vi.fn();
    const model: Parameter = {
      id: 'damage-model',
      label: 'Damage model',
      type: 'enum',
      value: 'forgiving',
      options: [
        { value: 'forgiving', label: 'Forgiving' },
        { value: 'ironman', label: 'Ironman' },
      ],
    };
    render(<Tuner initial={model} onCommit={onCommit} />);

    const select = screen.getByLabelText('Damage model') as HTMLSelectElement;
    expect(select.value).toBe('forgiving');
    expect(select.options).toHaveLength(2);

    fireEvent.change(select, { target: { value: 'ironman' } });

    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ value: 'ironman' }));
  });

  it('warns about a value the bounds moved out from under, and keeps showing it', () => {
    render(<ParameterControl parameter={{ ...capacity, value: 900 }} onChange={vi.fn()} />);

    expect(screen.getByText('900 s')).toBeDefined();
    expect(screen.getByText('Above the maximum of 240 s.')).toBeDefined();
  });

  it('keeps an enum value whose option was removed selectable until it is replaced', () => {
    const orphan: Parameter = {
      id: 'damage-model',
      label: 'Damage model',
      type: 'enum',
      value: 'ironman',
      options: [{ value: 'forgiving', label: 'Forgiving' }],
    };
    render(<ParameterControl parameter={orphan} onChange={vi.fn()} />);

    expect((screen.getByLabelText('Damage model') as HTMLSelectElement).value).toBe('ironman');
    expect(screen.getByText('This value is no longer one of the options.')).toBeDefined();
  });

  it('disables every control at once', () => {
    render(<ParameterControl parameter={capacity} onChange={vi.fn()} disabled />);

    expect(numberInput().disabled).toBe(true);
    expect(
      (screen.getByLabelText('Base Oxygen Capacity slider') as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it('keeps two lists of the same parameters apart', () => {
    render(
      <>
        <ParameterControl parameter={capacity} onChange={vi.fn()} idPrefix="a" />
        <ParameterControl parameter={capacity} onChange={vi.fn()} idPrefix="b" />
      </>,
    );

    const ids = screen.getAllByRole('spinbutton').map((field) => field.id);
    expect(ids).toEqual(['a-base-oxygen-capacity', 'b-base-oxygen-capacity']);
  });
});

describe('ParameterSummary', () => {
  it('lists label and formatted value for every type', () => {
    render(
      <ParameterSummary
        parameters={[
          capacity,
          { id: 'crit', label: 'Crit chance', type: 'percentage', value: 35 },
          { id: 'allow', label: 'Allow sprinting', type: 'boolean', value: true },
          {
            id: 'model',
            label: 'Damage model',
            type: 'enum',
            value: 'ironman',
            options: [{ value: 'ironman', label: 'Ironman' }],
          },
        ]}
      />,
    );

    expect(screen.getByText('120 s')).toBeDefined();
    expect(screen.getByText('35%')).toBeDefined();
    expect(screen.getByText('On')).toBeDefined();
    expect(screen.getByText('Ironman')).toBeDefined();
  });

  it('captions each category', () => {
    render(
      <ParameterSummary
        parameters={[
          { ...capacity, group: 'Oxygen' },
          { id: 'cost', label: 'Repair cost', type: 'number', value: 40, group: 'Economy' },
        ]}
      />,
    );

    expect(screen.getByText('Oxygen')).toBeDefined();
    expect(screen.getByText('Economy')).toBeDefined();
  });

  it('has nothing to say about an empty list unless the caller supplies a line', () => {
    const { container, rerender } = render(<ParameterSummary parameters={[]} />);
    expect(container.textContent).toBe('');

    rerender(<ParameterSummary parameters={[]} emptyLabel="No parameters yet." />);
    expect(screen.getByText('No parameters yet.')).toBeDefined();
  });

  it('renders no editable control', () => {
    render(<ParameterSummary parameters={[capacity]} />);

    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
