import { cn } from './cn';
import { EmptyState } from './empty-state';
import { Panel } from './panel';

export interface ActivityListItem {
  id: string;
  /**
   * The precomputed sentence, e.g. "Kael Voss archived" or "Oxygen
   * Management — v3 saved". Rendered verbatim — never re-derived from the
   * subject, so an archived or deleted subject still reads sensibly.
   */
  summary: string;
  createdAt: Date | string;
  /**
   * Where the subject can still be opened. Omit it when the caller could not
   * resolve the subject (archived, deleted, or simply not linked yet) — the
   * row still renders, just without a link.
   */
  href?: string;
}

export interface ActivityListProps {
  items: ActivityListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

/**
 * The reusable activity feed (design spec section 63): one line per
 * meaningful change, newest first, deep-linking to its subject when the
 * caller can still resolve one. Used on Project Overview and in contextual
 * workspaces, such as the Prototype workspace's activity panel (spec
 * section 37) — the caller decides what to fetch (the whole project, or one
 * subject) and hands the resulting rows straight to this component.
 */
export function ActivityList({
  items,
  emptyTitle,
  emptyDescription,
  className,
}: ActivityListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle ?? 'No activity yet'}
        description={emptyDescription ?? 'Meaningful changes to this project will show up here.'}
      />
    );
  }

  return (
    <Panel className={cn('divide-y divide-border-subtle overflow-hidden', className)}>
      {items.map((item) => (
        <ActivityRow key={item.id} item={item} />
      ))}
    </Panel>
  );
}

function ActivityRow({ item }: { item: ActivityListItem }) {
  const content = (
    <>
      <p className="text-sm text-foreground">{item.summary}</p>
      <p className="mt-0.5 text-xs text-faint-foreground">{formatRelativeTime(item.createdAt)}</p>
    </>
  );

  if (!item.href) {
    return <div className="px-4 py-3">{content}</div>;
  }

  return (
    <a href={item.href} className="block px-4 py-3 transition-colors duration-150 hover:bg-hover">
      {content}
    </a>
  );
}

const RELATIVE_TIME_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "3 minutes ago" style label for a feed row's timestamp. */
function formatRelativeTime(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const magnitude = Math.abs(seconds);

  for (const [unit, unitSeconds] of RELATIVE_TIME_UNITS) {
    if (magnitude >= unitSeconds) {
      return relativeTimeFormatter.format(Math.round(seconds / unitSeconds), unit);
    }
  }
  return 'just now';
}
