import { describe, expect, it } from 'vitest';

import { sectionInView } from './scroll-position';

describe('sectionInView', () => {
  it('is null with no headings', () => {
    expect(sectionInView([], 400)).toBeNull();
  });

  it('is the first heading before the writer has scrolled past it', () => {
    const positions = [
      { id: 'a', top: 0 },
      { id: 'b', top: 600 },
    ];

    expect(sectionInView(positions, 0)).toBe('a');
  });

  it('becomes the next heading once its top passes the scroll position', () => {
    const positions = [
      { id: 'a', top: 0 },
      { id: 'b', top: 600 },
      { id: 'c', top: 1200 },
    ];

    expect(sectionInView(positions, 650)).toBe('b');
  });

  it('stays on the last heading once the writer scrolls past every one', () => {
    const positions = [
      { id: 'a', top: 0 },
      { id: 'b', top: 600 },
    ];

    expect(sectionInView(positions, 5000)).toBe('b');
  });

  it('picks the heading exactly at the scroll position, not the one before it', () => {
    const positions = [
      { id: 'a', top: 0 },
      { id: 'b', top: 600 },
    ];

    expect(sectionInView(positions, 600)).toBe('b');
  });
});
