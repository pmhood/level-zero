import * as React from 'react';

import { cn } from './cn';

/**
 * The three-zone desktop layout every project tool shares (spec section 5):
 * navigation, a fluid workspace, and an optional inspector.
 */
export function AppShell({
  sidebar,
  topbar,
  inspector,
  children,
}: {
  sidebar: React.ReactNode;
  topbar?: React.ReactNode;
  inspector?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-background text-foreground">
      {sidebar}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {topbar}
        {/* Each page owns its own scroll behavior below this point, so a page
            that docks its own inspector (e.g. Idea Lab) can scroll that
            independently of the rest of the workspace (spec section 21). */}
        <div className="min-h-0 flex-1">{children}</div>
      </main>
      {inspector}
    </div>
  );
}

export interface SidebarNavItem {
  key: string;
  href: string;
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
}

export interface AppSidebarProps {
  items: SidebarNavItem[];
  header?: React.ReactNode;
  footer?: React.ReactNode;
  /**
   * Defaults to a plain anchor. Pass the app router's link component (e.g.
   * `next/link`'s `Link`) for client-side navigation without coupling this
   * package to a particular framework.
   */
  linkComponent?: React.ComponentType<{
    href: string;
    className?: string;
    children?: React.ReactNode;
  }>;
}

/** Project-level destinations (spec section 6) — not every sub-feature. */
export function AppSidebar({ items, header, footer, linkComponent }: AppSidebarProps) {
  const LinkComponent = linkComponent ?? 'a';

  return (
    <nav className="flex w-[184px] shrink-0 flex-col border-r border-border-subtle bg-sidebar">
      {header && <div className="shrink-0 px-2.5 py-3">{header}</div>}

      <ul className="flex-1 space-y-0.5 px-2.5">
        {items.map((item) => (
          <li key={item.key}>
            <LinkComponent
              href={item.href}
              className={cn(
                'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-hover hover:text-foreground',
                item.active &&
                  'bg-active text-foreground ring-1 ring-inset ring-[var(--lz-blue-muted)]',
              )}
            >
              {item.icon}
              {item.label}
            </LinkComponent>
          </li>
        ))}
      </ul>

      {footer && <div className="shrink-0 px-2.5 py-3">{footer}</div>}
    </nav>
  );
}

export interface TopbarProps {
  breadcrumb: React.ReactNode;
  actions?: React.ReactNode;
}

/** The 48px bar for breadcrumbs and page-level actions (spec section 7). */
export function Topbar({ breadcrumb, actions }: TopbarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border-subtle px-4">
      <div className="min-w-0 truncate text-sm text-muted-foreground">{breadcrumb}</div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
