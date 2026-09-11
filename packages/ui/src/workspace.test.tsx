import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EntityCardSkeleton } from './entity-card';
import { Field } from './field';
import { Input } from './input';
import { Inspector } from './inspector';
import { SearchField } from './search-field';
import { WorkspaceBrowser } from './workspace-browser';
import { WorkspacePage } from './workspace-page';

describe('WorkspacePage', () => {
  it('lays out the header, the tool tabs, the body and the inspector', () => {
    render(
      <WorkspacePage
        title="Mechanics"
        description="Systems that can be tuned."
        actions={<button type="button">New mechanic</button>}
        toolbar={<nav aria-label="Mechanics views">Systems</nav>}
        inspector={<Inspector title="Selection">Panel body</Inspector>}
      >
        <p>Workspace body</p>
      </WorkspacePage>,
    );

    expect(screen.getByRole('heading', { name: 'Mechanics' })).toBeDefined();
    expect(screen.getByText('Systems that can be tuned.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'New mechanic' })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Mechanics views' })).toBeDefined();
    expect(screen.getByText('Workspace body')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Selection' })).toBeDefined();
  });

  it('keeps the compact header when a tool passes no artwork', () => {
    const { container } = render(
      <WorkspacePage title="Mechanics" description="Systems that can be tuned.">
        <p>Workspace body</p>
      </WorkspacePage>,
    );

    const header = container.querySelector('header');
    expect(header?.style.backgroundImage).toBe('');
    expect(header?.className).not.toContain('min-h-[180px]');
  });

  it('renders the cinematic header over the artwork, with the scrim above it', () => {
    const { container } = render(
      <WorkspacePage title="World" description="The setting." image="/headers/world.jpg">
        <p>Workspace body</p>
      </WorkspacePage>,
    );

    const header = container.querySelector('header');
    // The scrim is listed first so it stacks above the artwork, and the
    // artwork is a background rather than an <img> because it is decorative.
    expect(header?.style.backgroundImage).toMatch(
      /^linear-gradient\(.*\).*url\(.*\/headers\/world\.jpg.*\)$/,
    );
    expect(header?.className).toContain('min-h-[180px]');
    expect(container.querySelector('img')).toBeNull();

    expect(screen.getByRole('heading', { name: 'World' })).toBeDefined();
    expect(screen.getByText('The setting.')).toBeDefined();
  });

  it('leaves out the toolbar and inspector rows when a tool has neither', () => {
    const { container } = render(
      <WorkspacePage title="Mechanics">
        <p>Workspace body</p>
      </WorkspacePage>,
    );

    expect(container.querySelector('aside')).toBeNull();
  });
});

describe('WorkspaceBrowser', () => {
  it('names the column and keeps its filters and footer out of the scrolling list', () => {
    render(
      <WorkspaceBrowser
        label="Mechanics"
        toolbar={<SearchField label="Search mechanics" />}
        footer={<p>3 shown</p>}
      >
        <p>List</p>
      </WorkspaceBrowser>,
    );

    const column = screen.getByRole('region', { name: 'Mechanics' });
    expect(within(column).getByRole('searchbox', { name: 'Search mechanics' })).toBeDefined();
    expect(within(column).getByText('3 shown')).toBeDefined();

    // The list scrolls on its own; the toolbar and footer do not move with it.
    const scroller = within(column).getByText('List').parentElement;
    expect(scroller?.className).toContain('overflow-y-auto');
  });
});

describe('Field', () => {
  it('labels the control it names', () => {
    render(
      <Field label="Player fantasy" htmlFor="fantasy" hint="What it should feel like.">
        <Input id="fantasy" />
      </Field>,
    );

    expect(screen.getByLabelText('Player fantasy')).toBeDefined();
    expect(screen.getByText('What it should feel like.')).toBeDefined();
  });

  it('captions a group of controls rather than mislabelling one of them', () => {
    render(
      <Field label="Tags">
        <Input aria-label="Add a tag" />
      </Field>,
    );

    expect(screen.queryByLabelText('Tags')).toBeNull();
    expect(screen.getByText('Tags')).toBeDefined();
  });
});

describe('EntityCardSkeleton', () => {
  it('is a placeholder, so it is hidden from assistive technology', () => {
    const { container } = render(<EntityCardSkeleton />);

    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});
