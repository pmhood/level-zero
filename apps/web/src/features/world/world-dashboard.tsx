'use client';

import type { Entity, EntityType } from '@level-zero/domain';
import {
  Button,
  EmptyState,
  EntityCard,
  EntityCardSkeleton,
  SectionPanel,
  Tag,
} from '@level-zero/ui';
import type { ReactNode } from 'react';

import { entityTypeLabel } from '@/features/entities/entity-presentation';
import { apiErrorMessage } from '@/lib/api';

import {
  canonStatusBadge,
  environmentTags,
  orderByEra,
  readWorld,
  riskLabel,
  type WorldEntityType,
} from './world';

/** How the dashboard's panels ask the workspace to open the browser. */
export interface WorldDashboardHandlers {
  onSelect: (entity: Entity) => void;
  onBrowseType: (type: WorldEntityType) => void;
  onBrowseTag: (tag: string) => void;
  onCreate: (type: WorldEntityType) => void;
}

export interface WorldDashboardProps extends WorldDashboardHandlers {
  entities: Entity[];
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
}

/**
 * The World dashboard (UX spec, "World" — Overview): the shape of the setting
 * at a glance, panel by panel, rather than one endlessly scrolling document.
 *
 * Every panel is a slice of the same canonical entity list the browser reads,
 * and every card is a way into the detail surface — the dashboard answers
 * "what is this world?" and hands off to "work on this piece of it".
 */
export function WorldDashboard({
  entities,
  isPending,
  error,
  onRetry,
  onSelect,
  onBrowseType,
  onBrowseTag,
  onCreate,
}: WorldDashboardProps) {
  if (isPending) {
    return (
      <DashboardScroller>
        <div
          role="status"
          aria-label="Loading the world"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <EntityCardSkeleton key={index} />
          ))}
        </div>
      </DashboardScroller>
    );
  }

  if (error != null) {
    return (
      <DashboardScroller>
        <EmptyState
          title="Couldn't load the world"
          description={apiErrorMessage(error)}
          actions={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      </DashboardScroller>
    );
  }

  if (entities.length === 0) {
    return (
      <DashboardScroller>
        <EmptyState
          title="The world is empty"
          description="A setting starts with somewhere the game happens and someone who wants it. Regions hold locations, factions hold regions, and everything else hangs off those."
          actions={
            <>
              <Button size="sm" onClick={() => onCreate('region')}>
                Create a region
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onCreate('faction')}>
                Create a faction
              </Button>
            </>
          }
        />
      </DashboardScroller>
    );
  }

  const handlers = { onSelect, onBrowseType, onBrowseTag, onCreate };
  const events = orderByEra(ofType(entities, 'event'));
  const tags = environmentTags(entities);

  return (
    <DashboardScroller>
      <TypePanel
        title="Major Factions"
        description="Who wants this world, and what they are willing to do about it."
        type="faction"
        entities={entities}
        {...handlers}
      />

      <TypePanel
        title="Key Locations"
        description="The places the game actually happens in."
        type="location"
        entities={entities}
        {...handlers}
      />

      <TypePanel
        title="Regions"
        description="The larger territory locations sit inside."
        type="region"
        entities={entities}
        {...handlers}
      />

      <SectionPanel
        title="Timeline"
        description="The setting's history, earliest first. Undated events sort last."
        actions={<SeeAll label="events" onClick={() => onBrowseType('event')} />}
      >
        {events.length === 0 ? (
          <EmptyPanelPrompt
            message="No events yet. History is what makes a place feel lived in — start with the one everyone still talks about."
            action="Add an event"
            onCreate={() => onCreate('event')}
          />
        ) : (
          <ol className="flex flex-col gap-1.5">
            {events.map((event) => {
              const { era } = readWorld(event);
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(event)}
                    className="flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left hover:bg-hover"
                  >
                    <span className="w-24 shrink-0 text-xs text-primary">{era || 'Undated'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{event.name}</span>
                      {event.description && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {event.description}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </SectionPanel>

      <SectionPanel
        title="Environment Tags"
        description="The vocabulary this world already uses. Pick one to see everything it touches."
      >
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing tagged yet. Tag a place with what it is like to be there — vacuum, low gravity,
            contested — and the world&rsquo;s vocabulary builds itself.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map(({ tag, count }) => (
              <button
                key={tag}
                type="button"
                onClick={() => onBrowseTag(tag)}
                aria-label={`Browse everything tagged ${tag}`}
              >
                <Tag className="hover:border-border-strong hover:text-foreground">
                  {tag} · {count}
                </Tag>
              </button>
            ))}
          </div>
        )}
      </SectionPanel>

      <TypePanel
        title="Hazards"
        description="What this world does to the people in it."
        type="hazard"
        entities={entities}
        {...handlers}
      />

      <TypePanel
        title="Cultures"
        description="How the people here live, and what they believe about the rest."
        type="culture"
        entities={entities}
        {...handlers}
      />

      <TypePanel
        title="Technology"
        description="What this world can build, and who is allowed to."
        type="technology"
        entities={entities}
        {...handlers}
      />

      <TypePanel
        title="Lore"
        description="The long-form canon: histories, rumours and the stories people tell."
        type="lore"
        entities={entities}
        {...handlers}
      />
    </DashboardScroller>
  );
}

function DashboardScroller({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5">{children}</div>;
}

function ofType(entities: readonly Entity[], type: EntityType): Entity[] {
  return entities.filter((entity) => entity.type === type);
}

function SeeAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      All {label}
    </Button>
  );
}

/** One kind of world object, as cards, with a way to see the rest of them. */
function TypePanel({
  title,
  description,
  type,
  entities,
  onSelect,
  onBrowseType,
  onCreate,
}: WorldDashboardHandlers & {
  title: string;
  description: string;
  type: WorldEntityType;
  entities: Entity[];
}) {
  const matching = ofType(entities, type);
  const label = entityTypeLabel(type).toLowerCase();

  return (
    <SectionPanel
      title={title}
      description={description}
      actions={
        matching.length > 0 ? (
          <SeeAll label={label} onClick={() => onBrowseType(type)} />
        ) : undefined
      }
    >
      {matching.length === 0 ? (
        <EmptyPanelPrompt
          message={`No ${label} yet.`}
          action={`Add ${label}`}
          onCreate={() => onCreate(type)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {matching.slice(0, 6).map((entity) => {
            const { canonStatus, risk } = readWorld(entity);
            return (
              <EntityCard
                key={entity.id}
                name={entity.name}
                typeLabel={entityTypeLabel(entity.type)}
                status={canonStatusBadge(canonStatus)}
                description={entity.description}
                tags={entity.tags}
                onClick={() => onSelect(entity)}
                footer={risk !== 'none' ? <Tag>{riskLabel(risk)}</Tag> : undefined}
              />
            );
          })}
        </div>
      )}
    </SectionPanel>
  );
}

function EmptyPanelPrompt({
  message,
  action,
  onCreate,
}: {
  message: string;
  action: string;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="secondary" size="sm" onClick={onCreate}>
        {action}
      </Button>
    </div>
  );
}
