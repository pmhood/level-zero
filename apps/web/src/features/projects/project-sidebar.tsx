'use client';

import {
  AppSidebar,
  DocumentIcon,
  IdeaLabIcon,
  MechanicsIcon,
  OverviewIcon,
  SearchIcon,
  type SidebarNavItem,
} from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { CharactersIcon } from '@/features/characters/character-icons';
import { WorldIcon } from '@/features/world/world-icon';

/**
 * `AppSidebar.linkComponent` takes a plain `{ href: string }` component so
 * `packages/ui` stays framework-agnostic; Next's typed routes give `Link`
 * itself a stricter, route-aware `href`, so this adapts one to the other.
 */
function SidebarLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link href={href as Route} className={className}>
      {children}
    </Link>
  );
}

export function ProjectSidebar({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const pathname = usePathname();
  const overviewHref = `/projects/${projectId}`;
  const ideaLabHref = `/projects/${projectId}/idea-lab`;
  const worldHref = `/projects/${projectId}/world`;
  const charactersHref = `/projects/${projectId}/characters`;
  const mechanicsHref = `/projects/${projectId}/mechanics`;
  const gddHref = `/projects/${projectId}/gdd`;
  const searchHref = `/projects/${projectId}/search`;

  const items: SidebarNavItem[] = [
    {
      key: 'overview',
      href: overviewHref,
      label: 'Overview',
      icon: <OverviewIcon className="size-4" />,
      active: pathname === overviewHref,
    },
    {
      key: 'idea-lab',
      href: ideaLabHref,
      label: 'Idea Lab',
      icon: <IdeaLabIcon className="size-4" />,
      active: pathname?.startsWith(ideaLabHref) ?? false,
    },
    {
      key: 'world',
      href: worldHref,
      label: 'World',
      icon: <WorldIcon className="size-4" />,
      active: pathname?.startsWith(worldHref) ?? false,
    },
    {
      key: 'characters',
      href: charactersHref,
      label: 'Characters',
      icon: <CharactersIcon className="size-4" />,
      active: pathname?.startsWith(charactersHref) ?? false,
    },
    {
      key: 'mechanics',
      href: mechanicsHref,
      label: 'Mechanics',
      icon: <MechanicsIcon className="size-4" />,
      active: pathname?.startsWith(mechanicsHref) ?? false,
    },
    {
      key: 'gdd',
      href: gddHref,
      label: 'GDD',
      icon: <DocumentIcon className="size-4" />,
      active: pathname?.startsWith(gddHref) ?? false,
    },
    {
      key: 'search',
      href: searchHref,
      label: 'Search',
      icon: <SearchIcon className="size-4" />,
      active: pathname?.startsWith(searchHref) ?? false,
    },
  ];

  return (
    <AppSidebar
      items={items}
      linkComponent={SidebarLink}
      header={
        <div className="px-1 py-1">
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
            ← All projects
          </Link>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">{projectName}</p>
        </div>
      }
    />
  );
}
