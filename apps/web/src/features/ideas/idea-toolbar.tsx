'use client';

import { Input, SearchIcon, Tabs, Tag } from '@level-zero/ui';

import type { IdeaTab } from './use-ideas';

export function IdeaToolbar({
  tab,
  onTabChange,
  search,
  onSearchChange,
  tags,
  activeTag,
  onTagChange,
}: {
  tab: IdeaTab;
  onTabChange: (tab: IdeaTab) => void;
  search: string;
  onSearchChange: (search: string) => void;
  tags: string[];
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <Tabs
          value={tab}
          onChange={(value) => onTabChange(value as IdeaTab)}
          items={[
            { value: 'ideas', label: 'Ideas' },
            { value: 'archived', label: 'Archived' },
          ]}
        />

        <div className="relative w-full max-w-[320px]">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search ideas…"
            className="pl-9"
            aria-label="Search ideas"
          />
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onTagChange(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            All tags
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagChange(tag === activeTag ? null : tag)}
            >
              <Tag
                className={
                  tag === activeTag
                    ? 'border-primary bg-active text-foreground'
                    : 'hover:border-border-strong'
                }
              >
                {tag}
              </Tag>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
