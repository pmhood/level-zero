// @vitest-environment jsdom
import type { OutcomeComparison, PrototypeVersion } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChangesVsOutcomes } from './changes-vs-outcomes';

vi.mock('@/lib/api', () => ({
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  compareOutcomes: vi.fn(),
  interpretOutcomes: vi.fn(),
  getGeneration: vi.fn(),
  getGenerationProvenance: vi.fn(),
}));

const api = await import('@/lib/api');

function version(overrides: Partial<PrototypeVersion> = {}): PrototypeVersion {
  return {
    id: 'pv_1',
    projectId: 'prj_1',
    prototypeId: 'ent_proto',
    versionNumber: 1,
    name: null,
    status: 'playable',
    notes: null,
    buildAssetId: null,
    members: [],
    createdBy: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

const v1 = version();
const v2 = version({ id: 'pv_2', versionNumber: 2 });

function playtest(id: string, name: string, prototypeVersionId: string) {
  return {
    id,
    projectId: 'prj_1',
    prototypeVersionId,
    name,
    goal: null,
    status: 'complete' as const,
    summary: null,
    tags: [],
    createdBy: null,
    createdAt: new Date('2026-02-01'),
    updatedAt: new Date('2026-02-01'),
  };
}

function feedback(id: string, playtestId: string, body: string, tags: string[]) {
  return {
    id,
    projectId: 'prj_1',
    playtestId,
    sessionId: null,
    body,
    sentiment: 'negative' as const,
    tags,
    author: 'Mara',
    createdAt: new Date('2026-02-01'),
    updatedAt: new Date('2026-02-01'),
  };
}

function comparison(overrides: Partial<OutcomeComparison> = {}): OutcomeComparison {
  const before = playtest('pt_1', 'First look', v1.id);
  const after = playtest('pt_2', 'Second look', v2.id);

  return {
    from: {
      version: v1,
      playtests: [before],
      sessionCount: 3,
      metrics: [],
    },
    to: {
      version: v2,
      playtests: [after],
      sessionCount: 2,
      metrics: [],
    },
    designChanges: [
      {
        entityId: 'ent_oxygen',
        name: 'Oxygen management',
        change: 'changed',
        from: { entityVersionId: 'ev_1', versionNumber: 1 },
        to: { entityVersionId: 'ev_2', versionNumber: 2 },
        groups: [
          {
            title: 'Tuning',
            differences: [
              {
                key: 'oxygen-drain',
                label: 'Oxygen drain',
                change: 'changed',
                from: '120 s',
                to: '90 s',
              },
            ],
          },
        ],
      },
    ],
    metricChanges: [
      {
        difference: {
          key: 'session-duration',
          label: 'Session duration',
          change: 'changed',
          from: '120 s',
          to: '90 s',
        },
        from: {
          metricKey: 'session-duration',
          label: 'Session duration',
          unit: 's',
          mean: 120,
          sampleCount: 3,
          playtestIds: [before.id],
        },
        to: {
          metricKey: 'session-duration',
          label: 'Session duration',
          unit: 's',
          mean: 90,
          sampleCount: 2,
          playtestIds: [after.id],
        },
      },
    ],
    feedbackThemes: [
      {
        category: 'difficulty',
        from: [feedback('pf_1', before.id, 'I ran out of air before the wreck.', ['difficulty'])],
        to: [],
      },
      {
        category: 'pacing',
        from: [],
        to: [feedback('pf_2', after.id, 'It moves too fast now.', ['pacing'])],
      },
    ],
    observationThemes: [],
    ...overrides,
  };
}

function renderView(onOpenPlaytests = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <ChangesVsOutcomes
        projectId="prj_1"
        prototypeId="ent_proto"
        versions={[v2, v1]}
        onOpenPlaytests={onOpenPlaytests}
      />
    </QueryClientProvider>,
  );

  return onOpenPlaytests;
}

beforeEach(() => {
  vi.mocked(api.compareOutcomes).mockResolvedValue(comparison());
  vi.mocked(api.interpretOutcomes).mockResolvedValue({
    generationId: 'gen_1',
    interpretation: 'Session duration moved alongside the retuning; it is worth testing.',
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Changes vs Outcomes', () => {
  it('compares the two newest versions without anyone choosing', async () => {
    renderView();

    await waitFor(() => expect(api.compareOutcomes).toHaveBeenCalled());
    expect(api.compareOutcomes).toHaveBeenCalledWith('prj_1', 'ent_proto', v1.id, v2.id);
  });

  it('reads a mechanic parameter change semantically', async () => {
    renderView();

    expect(await screen.findByText('Oxygen management')).toBeTruthy();
    expect(screen.getByText('v1 → v2')).toBeTruthy();
    expect(screen.getByText('Oxygen drain')).toBeTruthy();
    expect(screen.getAllByText('120 s').length).toBeGreaterThan(0);
    expect(screen.getAllByText('90 s').length).toBeGreaterThan(0);
  });

  it('states the sample behind every measured figure', async () => {
    renderView();

    expect(await screen.findByText(/mean of 3 measurements in/)).toBeTruthy();
    expect(screen.getByText(/mean of 2 measurements in/)).toBeTruthy();
  });

  it('opens the playtests behind a measured figure', async () => {
    const onOpenPlaytests = renderView();

    const source = await screen.findByRole('button', { name: 'First look' });
    fireEvent.click(source);

    expect(onOpenPlaytests).toHaveBeenCalledWith(v1.id);
  });

  it('groups feedback by category, keeping the words as written', async () => {
    renderView();

    const difficulty = await screen.findByRole('region', { name: 'difficulty' });
    expect(within(difficulty).getByText('I ran out of air before the wreck.')).toBeTruthy();
    expect(within(difficulty).getByText(/Mara · negative · First look/)).toBeTruthy();

    // A theme with nothing on the earlier side is one that appeared with B.
    const pacing = screen.getByRole('region', { name: 'pacing' });
    expect(within(pacing).getByText('New in B')).toBeTruthy();
  });

  it('filters the themes by category without losing the raw text', async () => {
    renderView();

    fireEvent.click(await screen.findByRole('button', { name: 'pacing (1)' }));

    expect(screen.queryByRole('region', { name: 'difficulty' })).toBeNull();
    expect(screen.getByText('It moves too fast now.')).toBeTruthy();
  });

  it('asks for an interpretation only when told to, and labels what comes back', async () => {
    renderView();

    await screen.findByText('Oxygen management');
    expect(api.interpretOutcomes).not.toHaveBeenCalled();
    expect(screen.queryByText('AI interpretation')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Interpret these results/ }));

    expect(await screen.findByText('AI interpretation')).toBeTruthy();
    expect(
      screen.getByText('Session duration moved alongside the retuning; it is worth testing.'),
    ).toBeTruthy();
    expect(api.interpretOutcomes).toHaveBeenCalledWith('prj_1', 'ent_proto', {
      from: v1.id,
      to: v2.id,
    });
    // The reading keeps the generation behind it reachable.
    expect(screen.getByRole('button', { name: 'Where this came from' })).toBeTruthy();
  });

  it('says what to do when there is only one version', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <ChangesVsOutcomes
          projectId="prj_1"
          prototypeId="ent_proto"
          versions={[v1]}
          onOpenPlaytests={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Nothing to correlate yet')).toBeTruthy();
    expect(api.compareOutcomes).not.toHaveBeenCalled();
  });
});
