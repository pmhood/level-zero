'use client';

import {
  PARAMETER_TYPES,
  createParameter,
  groupParameters,
  parameterDefinitionIssues,
  parameterId,
  type Parameter,
  type ParameterType,
} from '@level-zero/domain';
import {
  Button,
  CloseIcon,
  Field,
  Input,
  ParameterControl,
  PlusIcon,
  Select,
} from '@level-zero/ui';
import { useState } from 'react';

const PARAMETER_TYPE_LABELS: Record<ParameterType, string> = {
  number: 'Number',
  range: 'Range',
  percentage: 'Percentage',
  boolean: 'Toggle',
  enum: 'Options',
};

/** Metadata a parameter may leave unset, and which is dropped rather than stored blank. */
type OptionalKey = 'description' | 'group' | 'units' | 'min' | 'max' | 'step';

/**
 * The tuning tab: define a mechanic's parameters and turn their dials.
 *
 * Both at once on purpose — the bounds and the value are the same decision,
 * and separating "design a parameter" from "tune it" would mean two screens to
 * answer "is 120 s near the top of its range?".
 *
 * Rendered inside the detail form's `fieldset`, which is what disables every
 * control here while a mechanic is archived. Nothing saves from here: the
 * parameters go back to the form, which writes them into the entity's `data`
 * with the rest of the mechanic, so a tuning change is an ordinary entity
 * version.
 */
export function MechanicParameters({
  parameters,
  onChange,
}: {
  parameters: Parameter[];
  onChange: (parameters: Parameter[]) => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<ParameterType>('range');

  function replace(next: Parameter) {
    onChange(parameters.map((current) => (current.id === next.id ? next : current)));
  }

  function add() {
    if (label.trim().length === 0) return;
    setLabel('');
    onChange([...parameters, createParameter({ label, type, taken: parameters.map((p) => p.id) })]);
  }

  return (
    <div className="flex flex-col gap-4">
      {parameters.length === 0 ? (
        <p className="text-xs text-faint-foreground">
          No parameters yet. Add the numbers this mechanic is tuned by — capacity, drain rate, the
          odds — and they travel with it through versions, prototypes and playtests.
        </p>
      ) : (
        groupParameters(parameters).map((group) => (
          <div key={group.name ?? ''} className="flex flex-col gap-3">
            {group.name && (
              <p className="text-xs font-medium text-faint-foreground uppercase">{group.name}</p>
            )}
            {group.parameters.map((parameter) => (
              <ParameterRow
                key={parameter.id}
                parameter={parameter}
                onChange={replace}
                onRemove={() => onChange(parameters.filter((p) => p.id !== parameter.id))}
              />
            ))}
          </div>
        ))
      )}

      <div className="flex items-end gap-1.5 border-t border-border-subtle pt-4">
        <Field label="New parameter" htmlFor="mechanic-parameter-label" className="flex-1">
          <Input
            id="mechanic-parameter-label"
            value={label}
            placeholder="Base Oxygen Capacity"
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              add();
            }}
          />
        </Field>
        <Field label="Type" htmlFor="mechanic-parameter-type">
          <Select
            id="mechanic-parameter-type"
            value={type}
            onChange={(event) => setType(event.target.value as ParameterType)}
          >
            {PARAMETER_TYPES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {PARAMETER_TYPE_LABELS[candidate]}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={label.trim().length === 0}
          aria-label="Add parameter"
          onClick={add}
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function ParameterRow({
  parameter,
  onChange,
  onRemove,
}: {
  parameter: Parameter;
  onChange: (parameter: Parameter) => void;
  onRemove: () => void;
}) {
  const issues = parameterDefinitionIssues(parameter);

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start gap-1.5">
        <ParameterControl
          parameter={parameter}
          onChange={onChange}
          idPrefix="mechanic-parameter"
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${parameter.label}`}
          onClick={onRemove}
        >
          <CloseIcon className="size-4" />
        </Button>
      </div>

      {issues.map((issue) => (
        <p key={issue} className="mt-1.5 text-xs text-error">
          {issue}
        </p>
      ))}

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Definition
        </summary>
        <ParameterDefinition parameter={parameter} onChange={onChange} />
      </details>
    </div>
  );
}

/**
 * How the parameter is described and bounded, as opposed to what it is set to.
 *
 * The type and the id are missing from here on purpose: retyping a parameter
 * is deleting it and adding another, and the id is the one thing everything
 * else — a prototype, a playtest, a compare view — holds onto.
 */
function ParameterDefinition({
  parameter,
  onChange,
}: {
  parameter: Parameter;
  onChange: (parameter: Parameter) => void;
}) {
  const id = `mechanic-parameter-${parameter.id}`;
  const numeric = parameter.type !== 'boolean' && parameter.type !== 'enum';

  function set<K extends OptionalKey>(key: K, value: Parameter[K] | undefined) {
    const next = { ...parameter };
    if (value === undefined || value === '') delete next[key];
    else next[key] = value;
    onChange(next);
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-xs text-faint-foreground">
        {PARAMETER_TYPE_LABELS[parameter.type]} · <code>{parameter.id}</code>
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Label" htmlFor={`${id}-label`}>
          <Input
            id={`${id}-label`}
            value={parameter.label}
            onChange={(event) => onChange({ ...parameter, label: event.target.value })}
          />
        </Field>
        <Field label="Category" htmlFor={`${id}-group`} hint="Optional. Groups the list.">
          <Input
            id={`${id}-group`}
            value={parameter.group ?? ''}
            placeholder="Oxygen"
            onChange={(event) => set('group', event.target.value)}
          />
        </Field>
      </div>

      <Field label="Description" htmlFor={`${id}-description`}>
        <Input
          id={`${id}-description`}
          value={parameter.description ?? ''}
          placeholder="How long a full tank lasts standing still."
          onChange={(event) => set('description', event.target.value)}
        />
      </Field>

      {numeric && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {parameter.type !== 'percentage' && (
            <Field label="Units" htmlFor={`${id}-units`}>
              <Input
                id={`${id}-units`}
                value={parameter.units ?? ''}
                placeholder="s"
                onChange={(event) => set('units', event.target.value)}
              />
            </Field>
          )}
          <NumberField
            label="Minimum"
            id={`${id}-min`}
            value={parameter.min}
            onChange={(v) => set('min', v)}
          />
          <NumberField
            label="Maximum"
            id={`${id}-max`}
            value={parameter.max}
            onChange={(v) => set('max', v)}
          />
          <NumberField
            label="Step"
            id={`${id}-step`}
            value={parameter.step}
            onChange={(v) => set('step', v)}
          />
        </div>
      )}

      {parameter.type === 'enum' && <ParameterOptions parameter={parameter} onChange={onChange} />}
    </div>
  );
}

function NumberField({
  label,
  id,
  value,
  onChange,
}: {
  label: string;
  id: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        type="number"
        step="any"
        value={value ?? ''}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(event.target.value.trim() === '' || !Number.isFinite(next) ? undefined : next);
        }}
      />
    </Field>
  );
}

/**
 * The choices an `enum` offers.
 *
 * Only the label is editable: the stored value is minted from the label the
 * option was added under and then left alone, so renaming "Ironman" to
 * "Unforgiving" does not orphan every mechanic already set to it.
 */
function ParameterOptions({
  parameter,
  onChange,
}: {
  parameter: Parameter;
  onChange: (parameter: Parameter) => void;
}) {
  const options = parameter.options ?? [];

  function set(next: typeof options) {
    onChange({ ...parameter, options: next });
  }

  return (
    <Field label="Options">
      <ul className="flex flex-col gap-1.5">
        {options.map((option, index) => (
          <li key={option.value} className="flex items-center gap-1.5">
            <Input
              aria-label={`Option ${index + 1}`}
              value={option.label}
              onChange={(event) =>
                set(
                  options.map((o) =>
                    o.value === option.value ? { ...o, label: event.target.value } : o,
                  ),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove option ${option.label}`}
              onClick={() => set(options.filter((o) => o.value !== option.value))}
            >
              <CloseIcon className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => {
          const label = `Option ${options.length + 1}`;
          set([
            ...options,
            {
              value: parameterId(
                label,
                options.map((o) => o.value),
              ),
              label,
            },
          ]);
        }}
      >
        <PlusIcon className="size-4" />
        Add option
      </Button>
    </Field>
  );
}
