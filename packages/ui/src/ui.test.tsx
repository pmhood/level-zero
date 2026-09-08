import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';
import { cn } from './cn';
import { StatusBadge } from './status-badge';

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
    expect(classes).toContain('hover:bg-primary/90');
  });
});

describe('StatusBadge', () => {
  it('exposes the tone for styling and assertions', () => {
    render(<StatusBadge tone="down">redis</StatusBadge>);

    expect(screen.getByText('redis').dataset.tone).toBe('down');
  });
});
