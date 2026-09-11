// @vitest-environment jsdom
import type { ResolvedContext } from '@level-zero/ai';
import type { Asset, Entity } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiInspector } from './ai-inspector';
import type { AiSubject } from './ai-subject';

vi.mock('@/lib/api', () => ({
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listAiCapabilities: vi.fn(),
  runAiAction: vi.fn(),
  acceptAiActionResult: vi.fn(),
}));

const api = await import('@/lib/api');

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_kael',
    projectId: 'prj_1',
    type: 'character',
    name: 'Kael Voss',
    description: 'Salvages what the flood left.',
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

const asset = {
  id: 'ast_plate',
  projectId: 'prj_1',
  kind: 'image',
  filename: 'wreck-plate.png',
  mimeType: 'image/png',
} as Asset;

function context(overrides: Partial<ResolvedContext> = {}): ResolvedContext {
  return {
    project: { id: 'prj_1', name: 'Deep Fathom', description: null },
    instruction: 'Offer three variants of this character.',
    entities: [
      {
        id: 'ent_kael',
        type: 'character',
        name: 'Kael Voss',
        description: null,
        status: 'active',
        tags: [],
        source: 'selected',
        distance: 0,
        relation: null,
        viaEntityId: null,
      },
      {
        id: 'ent_oxygen',
        type: 'mechanic',
        name: 'Oxygen management',
        description: null,
        status: 'active',
        tags: [],
        source: 'related',
        distance: 1,
        relation: 'depends_on',
        viaEntityId: 'ent_kael',
      },
    ],
    assets: [],
    lineage: null,
    truncated: false,
    ...overrides,
  };
}

function renderInspector(subject: AiSubject) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AiInspector projectId="prj_1" subject={subject} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listAiCapabilities).mockResolvedValue({
    capabilities: ['text.generate', 'text.rewrite'],
  });
  vi.mocked(api.runAiAction).mockResolvedValue({
    generationId: 'gen_1',
    action: 'brainstorm-variants',
    capability: 'text.generate',
    output: 'She could be the one who stayed on the surface.',
    context: context(),
  });
});

afterEach(cleanup);

describe('AiInspector', () => {
  it('offers the questions that belong to what is selected', async () => {
    renderInspector({ kind: 'entity', entity: entity() });

    expect(await screen.findByRole('button', { name: 'Brainstorm variants' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expand backstory' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Critique the rules' })).toBeNull();
  });

  it('adapts to a mechanic, an asset and no selection with the same component', async () => {
    const mechanic = renderInspector({ kind: 'entity', entity: entity({ type: 'mechanic' }) });
    expect(await screen.findByRole('button', { name: 'Suggest tuning changes' })).toBeTruthy();
    mechanic.unmount();

    const file = renderInspector({ kind: 'asset', asset });
    expect(await screen.findByRole('button', { name: 'Suggest uses' })).toBeTruthy();
    file.unmount();

    renderInspector({ kind: 'project' });
    expect(await screen.findByRole('button', { name: 'What is this game missing?' })).toBeTruthy();
  });

  it('sends the selected subject, the action and its capability', async () => {
    renderInspector({ kind: 'entity', entity: entity() });

    fireEvent.click(await screen.findByRole('button', { name: 'Brainstorm variants' }));

    await waitFor(() => expect(api.runAiAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.runAiAction).mock.calls[0]?.[1]).toMatchObject({
      action: 'brainstorm-variants',
      capability: 'text.generate',
      selectedEntityIds: ['ent_kael'],
      relatedDepth: 1,
    });
  });

  it('scopes the request to the subject alone when related objects are excluded', async () => {
    renderInspector({ kind: 'entity', entity: entity() });

    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Include related project objects' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Brainstorm variants' }));

    await waitFor(() => expect(api.runAiAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.runAiAction).mock.calls[0]?.[1]).toMatchObject({ relatedDepth: 0 });
  });

  it('sends a freeform ask only once something has been typed', async () => {
    renderInspector({ kind: 'project' });

    const ask = await screen.findByRole('button', { name: 'Ask' });
    expect((ask as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask something' }), {
      target: { value: 'What is the core loop actually about?' },
    });
    fireEvent.click(ask);

    await waitFor(() => expect(api.runAiAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.runAiAction).mock.calls[0]?.[1]).toMatchObject({
      action: 'ask',
      instruction: 'What is the core loop actually about?',
    });
  });

  it('shows which project objects went into the request, and why each one did', async () => {
    renderInspector({ kind: 'entity', entity: entity() });

    fireEvent.click(await screen.findByRole('button', { name: 'Brainstorm variants' }));

    expect(await screen.findByText('Context: Deep Fathom · 2 objects')).toBeTruthy();
    expect(screen.getByText('Selected')).toBeTruthy();
    expect(screen.getByText('Related · Depends on')).toBeTruthy();
  });

  it('offers an action nothing can serve as unavailable rather than as a failure', async () => {
    vi.mocked(api.listAiCapabilities).mockResolvedValue({ capabilities: ['text.generate'] });
    renderInspector({ kind: 'entity', entity: entity({ type: 'document' }) });

    const rewrite = await screen.findByRole('button', { name: 'Rewrite as a summary' });
    await waitFor(() => expect((rewrite as HTMLButtonElement).disabled).toBe(true));
    expect(rewrite.getAttribute('title')).toContain('text.rewrite');

    fireEvent.click(rewrite);
    expect(api.runAiAction).not.toHaveBeenCalled();
  });

  it('writes nothing to the project until the answer is explicitly kept', async () => {
    vi.mocked(api.acceptAiActionResult).mockResolvedValue(
      entity({ id: 'ent_idea', type: 'idea', name: 'Brainstorm variants: Kael Voss' }),
    );
    renderInspector({ kind: 'entity', entity: entity() });

    fireEvent.click(await screen.findByRole('button', { name: 'Brainstorm variants' }));
    expect(await screen.findByText('She could be the one who stayed on the surface.')).toBeTruthy();
    expect(api.acceptAiActionResult).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Keep as idea' }));

    await waitFor(() => expect(api.acceptAiActionResult).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.acceptAiActionResult).mock.calls[0]?.slice(1)).toEqual([
      'gen_1',
      {
        name: 'Brainstorm variants: Kael Voss',
        text: 'She could be the one who stayed on the surface.',
      },
    ]);
    expect(await screen.findByText(/Kept as the idea/)).toBeTruthy();
  });

  it('discards an answer without writing anything', async () => {
    renderInspector({ kind: 'entity', entity: entity() });

    fireEvent.click(await screen.findByRole('button', { name: 'Brainstorm variants' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));

    expect(screen.queryByText('She could be the one who stayed on the surface.')).toBeNull();
    expect(api.acceptAiActionResult).not.toHaveBeenCalled();
  });

  it('drops the previous subject when the selection changes', async () => {
    const { rerender } = renderInspector({ kind: 'entity', entity: entity() });

    fireEvent.click(await screen.findByRole('button', { name: 'Brainstorm variants' }));
    expect(await screen.findByText('She could be the one who stayed on the surface.')).toBeTruthy();

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    rerender(
      <QueryClientProvider client={queryClient}>
        <AiInspector
          projectId="prj_1"
          subject={{ kind: 'entity', entity: entity({ id: 'ent_oxygen', type: 'mechanic' }) }}
        />
      </QueryClientProvider>,
    );

    // The previous subject's answer went with it, and so did its questions.
    expect(screen.queryByText('She could be the one who stayed on the surface.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Brainstorm variants' })).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: 'Critique the rules' }));

    await waitFor(() => expect(api.runAiAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.runAiAction).mock.calls[1]?.[1]).toMatchObject({
      action: 'critique-rules',
      selectedEntityIds: ['ent_oxygen'],
    });
  });

  it('reports a failed request where the user asked, and keeps the panel usable', async () => {
    vi.mocked(api.runAiAction).mockRejectedValue(new Error('The AI provider could not answer.'));
    renderInspector({ kind: 'entity', entity: entity() });

    fireEvent.click(await screen.findByRole('button', { name: 'Brainstorm variants' }));

    expect(await screen.findByText('The AI provider could not answer.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Brainstorm variants' })).toBeTruthy();
  });
});
