'use client';

import { Input, Tag } from '@level-zero/ui';
import { useState } from 'react';

export interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

/**
 * A small chip editor: type a tag and press Enter or `,` to add it. Server-side
 * normalization (trim, dedupe, lowercase) still applies on save; this just
 * manages the working list in the form.
 */
export function TagInput({ tags, onChange, placeholder = 'Add a tag…' }: TagInputProps) {
  const [draft, setDraft] = useState('');

  function commitDraft() {
    const next = draft.trim();
    setDraft('');
    if (next.length === 0 || tags.includes(next)) return;
    onChange([...tags, next]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <Tag key={tag} onRemove={() => onChange(tags.filter((t) => t !== tag))}>
          {tag}
        </Tag>
      ))}
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            commitDraft();
          } else if (event.key === 'Backspace' && draft.length === 0 && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={commitDraft}
        placeholder={placeholder}
        className="h-[26px] w-32 border-none bg-transparent px-1 text-xs focus:ring-0"
      />
    </div>
  );
}
