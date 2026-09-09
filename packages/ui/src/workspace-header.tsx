import * as React from 'react';

export interface WorkspaceHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * The compact workspace header (spec section 8) used by utility-heavy tool
 * pages such as Idea Lab: a title, one line of description, and actions.
 */
export function WorkspaceHeader({ title, description, actions }: WorkspaceHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4 px-4 py-5 xl:px-5 2xl:px-6">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-[34px] font-bold text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
