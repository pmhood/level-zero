// @vitest-environment jsdom
import { ENTITY_TYPES, type Entity, type EntityType } from '@level-zero/domain';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EntityDetailFallback } from './entity-detail-fallback';

function entity(type: EntityType, overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_1',
    projectId: 'prj_1',
    type,
    name: 'Something',
    description: null,
    status: 'active',
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe('EntityDetailFallback', () => {
  it('renders every entity type without crashing', () => {
    for (const type of ENTITY_TYPES) {
      const { unmount } = render(
        <EntityDetailFallback projectId="prj_1" entity={entity(type)} onOpen={() => {}} />,
      );
      unmount();
    }
  });

  it('shows the description and tags', () => {
    render(
      <EntityDetailFallback
        projectId="prj_1"
        entity={entity('idea', { description: 'A neon-lit heist.', tags: ['heist', 'neon'] })}
        onOpen={() => {}}
      />,
    );

    expect(screen.getByText('A neon-lit heist.')).toBeDefined();
    expect(screen.getByText('heist')).toBeDefined();
    expect(screen.getByText('neon')).toBeDefined();
  });

  it('says so when there is no description yet', () => {
    render(<EntityDetailFallback projectId="prj_1" entity={entity('idea')} onOpen={() => {}} />);

    expect(screen.getByText('No description yet.')).toBeDefined();
  });

  it('reads any rich-text field out of data and renders it read-only', () => {
    render(
      <EntityDetailFallback
        projectId="prj_1"
        entity={entity('document', {
          data: {
            content: {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chapter one.' }] }],
            },
          },
        })}
        onOpen={() => {}}
      />,
    );

    expect(screen.getByText('Chapter one.')).toBeDefined();
  });

  it('lists the remaining scalar data fields, humanized', () => {
    render(
      <EntityDetailFallback
        projectId="prj_1"
        entity={entity('asset_reference', { data: { assetId: 'ast_42', promoted: true } })}
        onOpen={() => {}}
      />,
    );

    expect(screen.getByText('Asset Id')).toBeDefined();
    expect(screen.getByText('ast_42')).toBeDefined();
    expect(screen.getByText('Promoted')).toBeDefined();
    expect(screen.getByText('Yes')).toBeDefined();
  });

  it('links to the owning workspace when the type has one', () => {
    render(<EntityDetailFallback projectId="prj_1" entity={entity('idea')} onOpen={() => {}} />);

    const link = screen.getByRole('link', { name: 'Open in Idea Lab' });
    expect(link.getAttribute('href')).toBe('/projects/prj_1/idea-lab');
  });

  it('renders no workspace link for a type with no browser', () => {
    render(
      <EntityDetailFallback
        projectId="prj_1"
        entity={entity('asset_reference')}
        onOpen={() => {}}
      />,
    );

    expect(screen.queryByRole('link')).toBeNull();
  });
});
