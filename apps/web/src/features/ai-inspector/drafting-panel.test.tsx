// @vitest-environment jsdom
import type { ResolvedContext } from '@level-zero/ai';
import type { Entity } from '@level-zero/domain';
import type { AcceptedAiEdit } from '@level-zero/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DraftingPanel } from './drafting-panel';

vi.mock('@/lib/api', () => ({
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listAiCapabilities: vi.fn(),
  runAiAction: vi.fn(),
  acceptAiActionResult: vi.fn(),
}));

const api = await import('@/lib/api');

function document(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_gdd',
    projectId: 'prj_1',
    type: 'document',
    name: 'Driftwake GDD',
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

function context(): ResolvedContext {
  return {
    project: { id: 'prj_1', name: 'Driftwake', description: null },
    instruction: 'irrelevant',
    entities: [],
    assets: [],
    lineage: null,
    truncated: false,
  };
}

function renderPanel(onInsert: (edit: Omit<AcceptedAiEdit, 'replaced'>) => void = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DraftingPanel
        projectId="prj_1"
        subject={{ kind: 'entity', entity: document() }}
        onInsert={onInsert}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listAiCapabilities).mockResolvedValue({ capabilities: ['text.generate'] });
  vi.mocked(api.runAiAction).mockResolvedValue({
    generationId: 'gen_1',
    action: 'draft-chat',
    capability: 'text.generate',
    output: '**Player Fantasy**\n\nSomething wondrous.',
    context: context(),
  });
});

afterEach(cleanup);

describe('DraftingPanel', () => {
  it('offers the conversation, the tabs and the four standing suggestions', async () => {
    renderPanel();

    expect(screen.getByRole('tab', { name: 'Chat' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Generate' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Summarize' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Specs' })).toBeTruthy();

    expect(
      screen.getByRole('button', { name: 'Turn the core loop into a detailed spec' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Write progression systems in more detail' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Summarize all design decisions' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Create a technical requirements checklist' }),
    ).toBeTruthy();

    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('sends a Chat request verbatim through the shared request path', async () => {
    renderPanel();

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'What is the core loop about?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(api.runAiAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.runAiAction).mock.calls[0]?.[1]).toMatchObject({
      capability: 'text.generate',
      instruction: 'What is the core loop about?',
      selectedEntityIds: ['ent_gdd'],
      relatedDepth: 1,
    });
  });

  it('frames the same request differently under Generate, Summarize and Specs', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: 'Specs' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'the core loop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(api.runAiAction).toHaveBeenCalledTimes(1));
    const specsInstruction = vi.mocked(api.runAiAction).mock.calls[0]?.[1]?.instruction;
    expect(specsInstruction).toContain('the core loop');
    expect(specsInstruction).toMatch(/structured technical spec/i);

    fireEvent.click(screen.getByRole('tab', { name: 'Summarize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(api.runAiAction).toHaveBeenCalledTimes(2));
    const summarizeInstruction = vi.mocked(api.runAiAction).mock.calls[1]?.[1]?.instruction;
    expect(summarizeInstruction).toMatch(/summari/i);
    expect(summarizeInstruction).not.toBe(specsInstruction);
  });

  it('runs a standing suggestion in one click, with no text required first', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Summarize all design decisions' }));

    await waitFor(() => expect(api.runAiAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.runAiAction).mock.calls[0]?.[1]).toMatchObject({
      capability: 'text.generate',
    });
    expect(vi.mocked(api.runAiAction).mock.calls[0]?.[1]?.instruction).toMatch(/summari/i);
  });

  it('renders the answer as formatted prose and offers Copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Summarize all design decisions' }));

    expect(await screen.findByText('Player Fantasy')).toBeTruthy();
    expect(screen.getByText('Player Fantasy').tagName).toBe('STRONG');

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('**Player Fantasy**\n\nSomething wondrous.'),
    );
    expect(await screen.findByText('Copied.')).toBeTruthy();
  });

  it('inserts the answer with its provenance, on an explicit click and not before', async () => {
    const onInsert = vi.fn();
    renderPanel(onInsert);

    fireEvent.click(screen.getByRole('button', { name: 'Summarize all design decisions' }));
    await screen.findByText('Player Fantasy');

    // Getting an answer back is not itself acceptance — nothing is inserted
    // until the writer explicitly asks for it.
    expect(onInsert).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Insert to Document' }));

    expect(onInsert).toHaveBeenCalledExactlyOnceWith({
      // The action id and output come from the generation itself — what the
      // API actually answered with — not from which button asked for it.
      action: 'draft-chat',
      label: 'Summarize all design decisions',
      instruction: expect.stringContaining('every design decision'),
      accepted: '**Player Fantasy**\n\nSomething wondrous.',
      generationId: 'gen_1',
    });
    expect(await screen.findByText('Inserted.')).toBeTruthy();
  });

  it('leaves no trace of an answer nobody accepted', async () => {
    const onInsert = vi.fn();
    renderPanel(onInsert);

    fireEvent.click(screen.getByRole('button', { name: 'Summarize all design decisions' }));
    await screen.findByText('Player Fantasy');

    // A second request replaces the first answer without ever inserting it.
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Something else' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(api.runAiAction).toHaveBeenCalledTimes(2));
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('reports a failed request and keeps the panel usable', async () => {
    vi.mocked(api.runAiAction).mockRejectedValue(new Error('The AI provider could not answer.'));
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Summarize all design decisions' }));

    expect(await screen.findByText('The AI provider could not answer.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Summarize all design decisions' })).toBeTruthy();
  });

  it('disables sending and the suggestions when nothing can serve the request', async () => {
    vi.mocked(api.listAiCapabilities).mockResolvedValue({ capabilities: [] });
    renderPanel();

    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'Summarize all design decisions',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Anything' } });
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
