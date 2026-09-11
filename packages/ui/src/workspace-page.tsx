import * as React from 'react';

import { WorkspaceHeader } from './workspace-header';

export interface WorkspacePageProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Environment artwork for the header; see `WorkspaceHeader`. Passing it
   * switches this page from the compact header to the cinematic one. */
  image?: string;
  /** Sub-navigation and filters for this tool. The sidebar carries
   * project-level destinations only, so a tool's own tabs live here. */
  toolbar?: React.ReactNode;
  /** The contextual panel; pass an `Inspector`. */
  inspector?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The shared project-tool page (spec section 55): header, tool tabs, the
 * workspace body and an optional inspector, with the padding and the
 * three-zone arrangement in one place instead of once per tool.
 *
 * The body is a fixed-height region rather than a scroll container, so a tool
 * that splits it into independently scrolling columns (a browser beside a
 * detail surface) gets that for free and a tool with one long column opts into
 * `overflow-y-auto` itself.
 */
export function WorkspacePage({
  title,
  description,
  actions,
  image,
  toolbar,
  inspector,
  children,
}: WorkspacePageProps) {
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader title={title} description={description} actions={actions} image={image} />
        {toolbar && <div className="shrink-0 px-4 xl:px-5 2xl:px-6">{toolbar}</div>}
        <div className="flex min-h-0 flex-1">{children}</div>
      </div>
      {inspector}
    </div>
  );
}
