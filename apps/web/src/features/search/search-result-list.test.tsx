// @vitest-environment jsdom
import type { SearchResult } from '@level-zero/domain';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SearchResultList } from './search-result-list';

function result(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    projectId: 'prj_1',
    sourceType: 'entity',
    sourceId: 'ent_kael',
    entityType: 'character',
    status: 'active',
    tags: [],
    title: 'Kael Voss',
    excerpt: 'Salvager, forty, out of air.',
    sourceVersionId: null,
    updatedAt: new Date(),
    score: 1,
    ...overrides,
  };
}

afterEach(cleanup);

describe('SearchResultList', () => {
  it('opens the canonical entity route for an entity hit', () => {
    render(<SearchResultList results={[result()]} projectId="prj_1" projectName="Driftwake" />);

    const link = screen.getByRole('link', { name: /Kael Voss/ });
    expect(link.getAttribute('href')).toBe('/projects/prj_1/entities/ent_kael');
  });

  it('is reachable by keyboard, not only by mouse', () => {
    render(<SearchResultList results={[result()]} projectId="prj_1" projectName="Driftwake" />);

    // A search result is a real link, so Tab reaches it and Enter/Space
    // activate it the way every other browser link does — no bespoke
    // keydown handling is needed or present.
    const link = screen.getByRole('link', { name: /Kael Voss/ });
    expect(link.tagName).toBe('A');
    link.focus();
    expect(link).toHaveProperty('tabIndex', 0);
  });

  it('leaves an asset or generation hit without a link, since neither is an entity', () => {
    render(
      <SearchResultList
        results={[
          result({
            sourceType: 'asset',
            sourceId: 'asset_1',
            entityType: null,
            title: 'Concept art',
          }),
        ]}
        projectId="prj_1"
        projectName="Driftwake"
      />,
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Concept art')).toBeDefined();
  });
});
