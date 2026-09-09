'use client';

import {
  AppSidebar,
  DocumentIcon,
  IdeaLabIcon,
  OverviewIcon,
  type SidebarNavItem,
} from '@level-zero/ui';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

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
  const gddHref = `/projects/${projectId}/gdd`;

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
      key: 'gdd',
      href: gddHref,
      label: 'GDD',
      icon: <DocumentIcon className="size-4" />,
      active: pathname?.startsWith(gddHref) ?? false,
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
