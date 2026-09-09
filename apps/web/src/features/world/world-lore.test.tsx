// @vitest-environment jsdom
import type { Entity, EntityPage } from '@level-zero/domain';
import type { JSONContent } from '@level-zero/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ENTITY_MENTION_NODE } from '@/features/entities/entity-reference';

import { WorldLore } from './world-lore';

vi.mock('@/lib/api', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listEntities: vi.fn(),
  updateEntity: vi.fn(),
}));

const api = await import('@/lib/api');

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_belt',
    projectId: 'prj_1',
    type: 'region',
    name: 'The Shattered Belt',
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

/** The faction as it is *now* — renamed since the lore was written. */
const WARDENS = entity({ id: 'ent_wardens', type: 'faction', name: 'The Belt Wardens' });

function mention(entityId: string, label: string): JSONContent {
  return {
    type: ENTITY_MENTION_NODE,
    attrs: { entityId, entityType: 'faction', label },
  };
}

function loreWith(...content: JSONContent[]) {
  return { type: 'doc', content: [{ type: 'paragraph', content }] };
}

function renderLore(subject: Entity, onOpenReference = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <WorldLore projectId="prj_1" entity={subject} onOpenReference={onOpenReference} />
    </QueryClientProvider>,
  );

  return onOpenReference;
}

describe('World lore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEntities).mockResolvedValue({
      items: [WARDENS],
      total: 1,
    } satisfies EntityPage);
  });

  afterEach(cleanup);

  it('resolves a reference to the canonical entity, not to what the lore stored', async () => {
    const subject = entity({ data: { lore: loreWith(mention(WARDENS.id, 'The Wardens')) } });

    const onOpenReference = renderLore(subject);

    // The stored label is stale; the chip shows the faction's current name.
    const chip = await screen.findByRole('button', { name: 'The Belt Wardens' });
    fireEvent.click(chip);

    await waitFor(() => expect(onOpenReference).toHaveBeenCalledWith(WARDENS));
  });

  it('shows a reference to something no longer in the project as broken', async () => {
    const subject = entity({ data: { lore: loreWith(mention('ent_gone', 'The Hollow')) } });

    renderLore(subject);

    const chip = await screen.findByRole('button', {
      name: 'Broken reference to a missing faction',
    });
    expect(chip.textContent).toContain('The Hollow');
  });

  it('will not edit the lore of an archived entity', () => {
    renderLore(entity({ status: 'archived', archivedAt: new Date() }));

    expect(screen.getByText('Restore this before editing its lore.')).toBeDefined();
  });
});
