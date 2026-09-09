import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ActivityList } from './activity-list';
import { Button } from './button';
import { cn } from './cn';
import { EmptyState } from './empty-state';
import { EntityCard } from './entity-card';
import { PromoteAction } from './promote-action';
import { StatusBadge } from './status-badge';
import { Tabs } from './tabs';
import { Tag } from './tag';

describe('cn', () => {
  it('joins conditional class names', () => {
    const isActive = false;

    expect(cn('a', isActive && 'b', undefined, 'c')).toBe('a c');
  });

  it('lets a caller-supplied class win over a conflicting default', () => {
    expect(cn('px-4 py-2', 'px-6')).toBe('py-2 px-6');
  });
});

describe('Button', () => {
  it('renders a button with the default variant classes', () => {
    render(<Button>Create project</Button>);
    const button = screen.getByRole('button', { name: 'Create project' });

    expect(button.className).toContain('bg-primary');
  });

  it('renders the child element when asChild is set', () => {
    render(
      <Button asChild>
        <a href="/projects">Open</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Open' });
    expect(link).toHaveProperty('href');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('merges a caller className over the variant default', () => {
    render(<Button className="bg-red-500">Danger</Button>);

    // tailwind-merge drops the conflicting base utility but keeps the
    // non-conflicting hover variant, so assert on classes not substrings.
    const classes = screen.getByRole('button').className.split(' ');
    expect(classes).toContain('bg-red-500');
    expect(classes).not.toContain('bg-primary');
    expect(classes).toContain('hover:bg-primary-hover');
  });

  it('renders the ai and danger variants reserved for generative and destructive actions', () => {
    render(
      <>
        <Button variant="ai">Explore variations</Button>
        <Button variant="danger">Archive</Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Explore variations' }).className).toContain(
      'text-ai-foreground',
    );
    expect(screen.getByRole('button', { name: 'Archive' }).className).toContain('text-error');
  });
});

describe('StatusBadge', () => {
  it('exposes the tone for styling and assertions', () => {
    render(<StatusBadge tone="error">redis</StatusBadge>);

    expect(screen.getByText('redis').dataset.tone).toBe('error');
  });
});

describe('Tag', () => {
  it('renders a remove button that calls onRemove', async () => {
    const onRemove = vi.fn();
    render(<Tag onRemove={onRemove}>Sci-Fi</Tag>);

    screen.getByRole('button', { name: 'Remove tag Sci-Fi' }).click();

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('omits the remove button when read-only', () => {
    render(<Tag>Sci-Fi</Tag>);

    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Tabs', () => {
  function ControlledTabs() {
    const [value, setValue] = useState('ideas');
    return (
      <Tabs
        value={value}
        onChange={setValue}
        items={[
          { value: 'ideas', label: 'Ideas' },
          { value: 'archived', label: 'Archived' },
        ]}
      />
    );
  }

  it('marks the active tab and switches on click', () => {
    render(<ControlledTabs />);

    expect(screen.getByRole('tab', { name: 'Ideas' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Archived' }));

    expect(screen.getByRole('tab', { name: 'Archived' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Ideas' }).getAttribute('aria-selected')).toBe('false');
  });
});

describe('EmptyState', () => {
  it('renders a title, description and actions', () => {
    render(
      <EmptyState
        title="No ideas yet"
        description="Capture a rough thought to get started."
        actions={<button>New idea</button>}
      />,
    );

    expect(screen.getByText('No ideas yet')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'New idea' })).not.toBeNull();
  });
});

describe('ActivityList', () => {
  it('renders a plain empty state when there is no activity', () => {
    render(<ActivityList items={[]} />);

    expect(screen.getByText('No activity yet')).not.toBeNull();
  });

  it('renders each summary, newest item first as given by the caller', () => {
    render(
      <ActivityList
        items={[
          { id: 'a-2', summary: 'Kael Voss archived', createdAt: new Date() },
          { id: 'a-1', summary: 'Kael Voss created', createdAt: new Date() },
        ]}
      />,
    );

    const rows = screen.getAllByText(/Kael Voss/);
    expect(rows.map((row) => row.textContent)).toEqual(['Kael Voss archived', 'Kael Voss created']);
  });

  it('links a row only when the caller resolved a deep link for its subject', () => {
    render(
      <ActivityList
        items={[
          { id: 'a-1', summary: 'Prototype v1 created', createdAt: new Date(), href: '/p/1' },
          { id: 'a-2', summary: 'Archived character restored', createdAt: new Date() },
        ]}
      />,
    );

    const link = screen.getByRole('link', { name: /Prototype v1 created/ }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/p/1');
    expect(screen.queryByRole('link', { name: /Archived character restored/ })).toBeNull();
    expect(screen.getByText('Archived character restored')).not.toBeNull();
  });
});

describe('EntityCard', () => {
  it('calls onClick and reflects the selected state', () => {
    const onClick = vi.fn();
    render(
      <EntityCard
        name="Scavenger's Drift"
        typeLabel="Idea"
        status={{ tone: 'neutral', label: 'Draft' }}
        description="A crew salvages derelict ships in a dying system."
        tags={['Sci-Fi', 'Survival']}
        selected
        onClick={onClick}
      />,
    );

    const card = screen.getByRole('button', { name: /Scavenger's Drift/ });
    card.click();

    expect(onClick).toHaveBeenCalledOnce();
    expect(card.className).toContain('border-primary');
    expect(screen.getByText('Draft')).not.toBeNull();
    expect(screen.getByText('Sci-Fi')).not.toBeNull();
  });
});

describe('PromoteAction', () => {
  it('invokes onPromote and shows a pending label', () => {
    const onPromote = vi.fn();
    const { rerender } = render(
      <PromoteAction from="idea" to="mechanic" label="Turn into Mechanic" onPromote={onPromote} />,
    );

    screen.getByRole('button', { name: 'Turn into Mechanic' }).click();
    expect(onPromote).toHaveBeenCalledOnce();

    rerender(
      <PromoteAction
        from="idea"
        to="mechanic"
        label="Turn into Mechanic"
        pending
        onPromote={onPromote}
      />,
    );
    expect(screen.getByRole('button', { name: 'Promoting…' })).toHaveProperty('disabled', true);
  });
});
