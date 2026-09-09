'use client';

import {
  clampParameterValue,
  formatParameterValue,
  parameterBounds,
  parameterValueIssue,
  type Parameter,
} from '@level-zero/domain';
import * as React from 'react';

import { cn } from './cn';
import { Input, Select } from './input';

export interface ParameterControlProps {
  parameter: Parameter;
  /** Called with the whole parameter so a caller never has to rebuild it. */
  onChange: (parameter: Parameter) => void;
  disabled?: boolean;
  /** Prefix for the control ids, so two lists can share a page. */
  idPrefix?: string;
  className?: string;
}

/**
 * One tuned value, edited (spec section 34).
 *
 * The slider is never the only way in: every numeric parameter also has a
 * number input, which is what carries the keyboard and the screen reader, and
 * which is the control the label points at. A value the bounds no longer
 * contain is shown as it is, with a warning, and comes back inside them the
 * moment the field is left — clamping on read would quietly rewrite the number
 * somebody chose.
 */
export function ParameterControl({
  parameter,
  onChange,
  disabled,
  idPrefix = 'parameter',
  className,
}: ParameterControlProps) {
  const controlId = `${idPrefix}-${parameter.id}`;
  const issue = parameterValueIssue(parameter);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={controlId} className="text-xs font-medium text-muted-foreground">
          {parameter.label}
        </label>
        <span className="text-sm font-medium tabular-nums text-foreground">
          {formatParameterValue(parameter)}
        </span>
      </div>

      {parameter.type === 'boolean' ? (
        <BooleanInput
          id={controlId}
          parameter={parameter}
          onChange={onChange}
          disabled={disabled}
        />
      ) : parameter.type === 'enum' ? (
        <EnumInput id={controlId} parameter={parameter} onChange={onChange} disabled={disabled} />
      ) : (
        <NumericInput
          id={controlId}
          parameter={parameter}
          onChange={onChange}
          disabled={disabled}
        />
      )}

      {parameter.description && (
        <p className="text-xs text-faint-foreground">{parameter.description}</p>
      )}
      {issue && <p className="text-xs text-warning">{issue}</p>}
    </div>
  );
}

interface InputProps {
  id: string;
  parameter: Parameter;
  onChange: (parameter: Parameter) => void;
  disabled?: boolean;
}

/**
 * A number, with a slider beside it whenever the parameter has both ends.
 *
 * While the field is being typed in it shows exactly what was typed, so `1` on
 * the way to `150` is not snapped to the minimum mid-keystroke; the clamp and
 * the step land on blur.
 */
function NumericInput({ id, parameter, onChange, disabled }: InputProps) {
  const [typed, setTyped] = React.useState<string | null>(null);
  const { min, max } = parameterBounds(parameter);
  const slider = min !== null && max !== null;
  const value = typeof parameter.value === 'number' ? parameter.value : 0;

  function commit(next: number) {
    onChange({ ...parameter, value: next });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        {slider && (
          <input
            type="range"
            aria-label={`${parameter.label} slider`}
            className="h-[34px] min-w-0 flex-1 accent-primary disabled:pointer-events-none disabled:opacity-50"
            value={clampParameterValue(parameter, value)}
            min={min}
            max={max}
            step={parameter.step ?? 1}
            disabled={disabled}
            onChange={(event) => {
              setTyped(null);
              commit(clampParameterValue(parameter, event.target.valueAsNumber));
            }}
          />
        )}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          className={slider ? 'w-24 shrink-0' : undefined}
          value={typed ?? String(value)}
          min={min ?? undefined}
          max={max ?? undefined}
          step={parameter.step ?? 'any'}
          disabled={disabled}
          onChange={(event) => {
            setTyped(event.target.value);
            const next = Number(event.target.value);
            if (event.target.value.trim() !== '' && Number.isFinite(next)) commit(next);
          }}
          onBlur={() => {
            setTyped(null);
            const clamped = clampParameterValue(parameter, value);
            if (clamped !== value) commit(clamped);
          }}
        />
      </div>

      {slider && (
        <div className="flex justify-between text-xs tabular-nums text-faint-foreground">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      )}
    </div>
  );
}

function BooleanInput({ id, parameter, onChange, disabled }: InputProps) {
  return (
    <input
      id={id}
      type="checkbox"
      className="size-4 accent-primary disabled:pointer-events-none disabled:opacity-50"
      checked={parameter.value === true}
      disabled={disabled}
      onChange={(event) => onChange({ ...parameter, value: event.target.checked })}
    />
  );
}

function EnumInput({ id, parameter, onChange, disabled }: InputProps) {
  const options = parameter.options ?? [];
  const value = typeof parameter.value === 'string' ? parameter.value : '';
  const orphaned = value.length > 0 && !options.some((option) => option.value === value);

  return (
    <Select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange({ ...parameter, value: event.target.value })}
    >
      {orphaned && <option value={value}>{value}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
