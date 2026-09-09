'use client';

import { Button, CloseIcon, Field, Input, PlusIcon } from '@level-zero/ui';
import { useState } from 'react';

export interface MechanicListFieldProps {
  label: string;
  /** Prefix for the row ids, e.g. `mechanic-rules`. */
  id: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}

/**
 * An ordered list of short lines — the rules of a mechanic, what it consumes,
 * what it produces.
 *
 * Deliberately not the rich-text editor: these are structured values that stay
 * editable and readable on their own, and the prose that explains them lives
 * in the mechanic's rationale instead.
 *
 * Rendered inside the detail form's `fieldset`, which is what disables every
 * control here while a mechanic is archived.
 */
export function MechanicListField({
  label,
  id,
  hint,
  items,
  onChange,
  placeholder,
}: MechanicListFieldProps) {
  const [draft, setDraft] = useState('');

  function addDraft() {
    const next = draft.trim();
    if (next.length === 0) return;
    setDraft('');
    onChange([...items, next]);
  }

  return (
    <Field label={label} hint={hint}>
      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-1.5">
              <Input
                id={`${id}-${index}`}
                aria-label={`${label} ${index + 1}`}
                value={item}
                onChange={(event) =>
                  onChange(items.map((current, i) => (i === index ? event.target.value : current)))
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${label} ${index + 1}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                <CloseIcon className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1.5">
        <Input
          aria-label={`New ${label} entry`}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addDraft();
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={draft.trim().length === 0}
          aria-label={`Add ${label} entry`}
          onClick={addDraft}
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>
    </Field>
  );
}
