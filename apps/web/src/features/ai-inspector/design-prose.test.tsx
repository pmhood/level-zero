// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DesignProse } from './design-prose';

afterEach(cleanup);

describe('DesignProse', () => {
  it('renders separate paragraphs for blank-line-separated blocks', () => {
    const { container } = render(<DesignProse text={'First paragraph.\n\nSecond paragraph.'} />);

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toBe('First paragraph.');
    expect(paragraphs[1]?.textContent).toBe('Second paragraph.');
  });

  it('keeps single newlines within one paragraph as line breaks', () => {
    const { container } = render(<DesignProse text={'Line one.\nLine two.'} />);

    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('br')).not.toBeNull();
  });

  it('renders **bold** and *italic* as real emphasis, not asterisks', () => {
    render(<DesignProse text="Players feel **wonder** and *tension* here." />);

    expect(screen.getByText('wonder').tagName).toBe('STRONG');
    expect(screen.getByText('tension').tagName).toBe('EM');
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it('renders a heading below the panel’s own h3, keyed by the outline level', () => {
    render(<DesignProse text={'## Player Fantasy\n\nBody text.'} />);

    const heading = screen.getByRole('heading', { name: 'Player Fantasy' });
    expect(heading.tagName).toBe('H5');
  });

  it('renders a bullet list as real list items', () => {
    render(<DesignProse text={'- Wonder\n- Curiosity\n- Tension'} />);

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Wonder',
      'Curiosity',
      'Tension',
    ]);
  });

  it('renders a numbered list as an ordered list', () => {
    const { container } = render(<DesignProse text={'1. First\n2. Second'} />);

    const list = container.querySelector('ol');
    expect(list).not.toBeNull();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'First',
      'Second',
    ]);
  });
});
