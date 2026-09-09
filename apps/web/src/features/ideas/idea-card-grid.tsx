'use client';

import type { Entity } from '@level-zero/domain';
import { EntityCard } from '@level-zero/ui';

import { entityStatusBadge } from '@/features/entities/entity-presentation';

/** Mirrors the final card shape so loading never jumps in size (spec section 42). */
function IdeaCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-border bg-surface p-3">
      <div className="h-4 w-2/3 rounded bg-raised" />
      <div className="mt-2 h-3 w-1/3 rounded bg-raised" />
      <div className="mt-3 h-3 w-full rounded bg-raised" />
      <div className="mt-1 h-3 w-4/5 rounded bg-raised" />
    </div>
  );
}

export function IdeaCardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <IdeaCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function IdeaCardGrid({
  ideas,
  selectedId,
  onSelect,
}: {
  ideas: Entity[];
  selectedId: string | null;
  onSelect: (idea: Entity) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {ideas.map((idea) => (
        <EntityCard
          key={idea.id}
          name={idea.name}
          typeLabel="Idea"
          status={entityStatusBadge(idea.status)}
          description={idea.description}
          tags={idea.tags}
          selected={idea.id === selectedId}
          onClick={() => onSelect(idea)}
        />
      ))}
    </div>
  );
}
