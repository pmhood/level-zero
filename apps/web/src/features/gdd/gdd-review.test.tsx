// @vitest-environment jsdom
import type {
  AnchoredReviewStatus,
  Comment,
  CommentThread,
  ReviewStatus,
} from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GddOutline } from './gdd-outline';
import { GddReview } from './gdd-review';

vi.mock('@/lib/api', () => ({
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listCommentThreads: vi.fn(),
  listAnchoredCommentThreads: vi.fn(),
  listAnchoredReviewStatuses: vi.fn(),
  createComment: vi.fn(),
  replyToComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
  resolveComment: vi.fn(),
  reopenComment: vi.fn(),
  getReviewStatus: vi.fn(),
  listReviewHistory: vi.fn(),
  recordReviewDecision: vi.fn(),
}));

const api = await import('@/lib/api');

const CORE_LOOP = 'section-core-loop';
const PILLARS = 'section-pillars';
const REMOVED = 'section-removed';

function heading(text: string, sectionId?: string) {
  return {
    type: 'heading',
    attrs: { level: 1, ...(sectionId === undefined ? {} : { sectionId }) },
    content: [{ type: 'text', text }],
  };
}

const body = {
  type: 'doc',
  content: [heading('Design pillars', PILLARS), heading('Core loop', CORE_LOOP)],
};

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'cmt_1',
    projectId: 'prj_1',
    target: { type: 'entity', id: 'doc_1', anchor: CORE_LOOP, versionId: null },
    parentCommentId: null,
    author: 'You',
    body: 'Still describes the old loop.',
    resolvedAt: null,
    resolvedBy: null,
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    updatedAt: new Date('2026-03-01T09:00:00.000Z'),
    ...overrides,
  };
}

function thread(overrides: Partial<Comment> = {}): CommentThread {
  return { comment: comment(overrides), replies: [] };
}

function status(overrides: Partial<ReviewStatus> = {}): ReviewStatus {
  return {
    target: {
      target: { type: 'entity', id: 'doc_1', anchor: null, versionId: null },
      label: 'Game Design Document',
      archived: false,
      currentVersionId: null,
    },
    state: 'draft',
    decision: null,
    staleDecision: null,
    ...overrides,
  };
}

function anchored(anchor: string, state: AnchoredReviewStatus['state']): AnchoredReviewStatus {
  return { anchor, state, decision: null };
}

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderReview(activeSectionId: string | null = CORE_LOOP) {
  const onSelectSection = vi.fn();
  const view = render(
    <QueryClientProvider client={client()}>
      <GddReview
        projectId="prj_1"
        documentId="doc_1"
        documentName="Game Design Document"
        content={body}
        activeSectionId={activeSectionId}
        onSelectSection={onSelectSection}
      />
    </QueryClientProvider>,
  );
  return { ...view, onSelectSection };
}

function renderOutline(activeSectionId: string | null = null) {
  return render(
    <QueryClientProvider client={client()}>
      <GddOutline
        projectId="prj_1"
        documentId="doc_1"
        content={body}
        activeSectionId={activeSectionId}
        onSelect={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getReviewStatus).mockResolvedValue(status());
  vi.mocked(api.listReviewHistory).mockResolvedValue([]);
  vi.mocked(api.listCommentThreads).mockResolvedValue([]);
  vi.mocked(api.listAnchoredCommentThreads).mockResolvedValue([]);
  vi.mocked(api.listAnchoredReviewStatuses).mockResolvedValue([]);
});

afterEach(cleanup);

describe('GddOutline — a status per section', () => {
  it('reads every section as Draft before anybody has decided anything', async () => {
    renderOutline();

    await waitFor(() => expect(screen.getAllByText('Draft')).toHaveLength(2));
  });

  it('shows each section the state its newest decision put it in', async () => {
    vi.mocked(api.listAnchoredReviewStatuses).mockResolvedValue([
      anchored(CORE_LOOP, 'approved'),
      anchored(PILLARS, 'review'),
    ]);

    renderOutline();

    await waitFor(() => expect(screen.getByText('Approved')).toBeDefined());
    expect(screen.getByText('In review')).toBeDefined();
  });

  it('marks how much of a section’s conversation is still open', async () => {
    vi.mocked(api.listAnchoredCommentThreads).mockResolvedValue([
      thread({ id: 'cmt_1' }),
      thread({ id: 'cmt_2' }),
      thread({
        id: 'cmt_3',
        resolvedAt: new Date('2026-03-02T09:00:00.000Z'),
        resolvedBy: 'You',
      }),
    ]);

    renderOutline();

    await waitFor(() => expect(screen.getByText('2 open comments')).toBeDefined());
  });

  it('carries no status for a heading whose id has not been minted yet', async () => {
    render(
      <QueryClientProvider client={client()}>
        <GddOutline
          projectId="prj_1"
          documentId="doc_1"
          content={{ type: 'doc', content: [heading('Old section')] }}
          activeSectionId={null}
          onSelect={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('Old section')).toBeDefined());
    expect(screen.queryByText('Draft')).toBeNull();
  });
});

describe('GddReview — reviewing a section', () => {
  it('reviews the section the writer is in, addressed by its heading’s id', async () => {
    renderReview();

    await waitFor(() =>
      expect(api.getReviewStatus).toHaveBeenCalledWith('prj_1', {
        targetType: 'entity',
        targetId: 'doc_1',
        anchor: CORE_LOOP,
      }),
    );
    expect(screen.getByRole('heading', { name: 'Core loop' })).toBeDefined();
  });

  it('reviews the document as a whole when no section is chosen', async () => {
    renderReview(null);

    await waitFor(() =>
      expect(api.getReviewStatus).toHaveBeenCalledWith('prj_1', {
        targetType: 'entity',
        targetId: 'doc_1',
      }),
    );
    expect(screen.getByRole('heading', { name: 'Game Design Document' })).toBeDefined();
  });

  it('offers every section and the document itself as a scope', async () => {
    const { onSelectSection } = renderReview();

    const scope = await screen.findByLabelText('Reviewing');
    expect(within(scope as HTMLSelectElement).getAllByRole('option')).toHaveLength(3);

    fireEvent.change(scope, { target: { value: PILLARS } });
    expect(onSelectSection).toHaveBeenCalledWith(PILLARS);
  });

  it('records a state change against the section, with who decided it', async () => {
    vi.mocked(api.recordReviewDecision).mockResolvedValue({
      id: 'dec_1',
      projectId: 'prj_1',
      target: { type: 'entity', id: 'doc_1', anchor: CORE_LOOP, versionId: null },
      state: 'approved',
      actor: 'You',
      note: null,
      decidedAt: new Date('2026-03-02T09:00:00.000Z'),
    });

    renderReview();

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(api.recordReviewDecision).toHaveBeenCalledWith('prj_1', {
        targetType: 'entity',
        targetId: 'doc_1',
        anchor: CORE_LOOP,
        state: 'approved',
        actor: 'You',
      }),
    );
  });

  it('carries the reviewer’s note with the decision', async () => {
    vi.mocked(api.recordReviewDecision).mockResolvedValue({
      id: 'dec_1',
      projectId: 'prj_1',
      target: { type: 'entity', id: 'doc_1', anchor: CORE_LOOP, versionId: null },
      state: 'review',
      actor: 'You',
      note: 'Needs the salvage numbers.',
      decidedAt: new Date('2026-03-02T09:00:00.000Z'),
    });

    renderReview();

    fireEvent.change(await screen.findByLabelText('Note'), {
      target: { value: 'Needs the salvage numbers.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request review' }));

    await waitFor(() =>
      expect(api.recordReviewDecision).toHaveBeenCalledWith('prj_1', {
        targetType: 'entity',
        targetId: 'doc_1',
        anchor: CORE_LOOP,
        state: 'review',
        actor: 'You',
        note: 'Needs the salvage numbers.',
      }),
    );
  });

  it('keeps the history of who decided what', async () => {
    vi.mocked(api.listReviewHistory).mockResolvedValue([
      {
        id: 'dec_2',
        projectId: 'prj_1',
        target: { type: 'entity', id: 'doc_1', anchor: CORE_LOOP, versionId: null },
        state: 'approved',
        actor: 'Kai',
        note: null,
        decidedAt: new Date('2026-03-02T09:00:00.000Z'),
      },
      {
        id: 'dec_1',
        projectId: 'prj_1',
        target: { type: 'entity', id: 'doc_1', anchor: CORE_LOOP, versionId: null },
        state: 'review',
        actor: 'Ada',
        note: 'Needs the salvage numbers.',
        decidedAt: new Date('2026-03-01T09:00:00.000Z'),
      },
    ]);

    renderReview();

    const history = await screen.findByRole('region', { name: 'Review history' });
    expect(within(history).getByText(/Kai/)).toBeDefined();
    expect(within(history).getByText(/Ada/)).toBeDefined();
    expect(within(history).getByText('Needs the salvage numbers.')).toBeDefined();
  });

  it('starts a thread on the section being reviewed', async () => {
    vi.mocked(api.createComment).mockResolvedValue(comment());

    renderReview();

    fireEvent.change(await screen.findByLabelText('Add a comment'), {
      target: { value: 'Still describes the old loop.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() =>
      expect(api.createComment).toHaveBeenCalledWith('prj_1', {
        targetType: 'entity',
        targetId: 'doc_1',
        anchor: CORE_LOOP,
        author: 'You',
        body: 'Still describes the old loop.',
      }),
    );
  });

  it('resolves a section’s thread', async () => {
    vi.mocked(api.listCommentThreads).mockResolvedValue([thread()]);
    vi.mocked(api.resolveComment).mockResolvedValue(
      comment({ resolvedAt: new Date('2026-03-02T09:00:00.000Z'), resolvedBy: 'You' }),
    );

    renderReview();

    fireEvent.click(await screen.findByRole('button', { name: 'Resolve' }));

    await waitFor(() => expect(api.resolveComment).toHaveBeenCalledWith('prj_1', 'cmt_1', 'You'));
  });

  it('reopens one that was resolved', async () => {
    vi.mocked(api.listCommentThreads).mockResolvedValue([
      thread({ resolvedAt: new Date('2026-03-02T09:00:00.000Z'), resolvedBy: 'You' }),
    ]);
    vi.mocked(api.reopenComment).mockResolvedValue(comment());

    renderReview();

    fireEvent.click(await screen.findByRole('button', { name: 'Reopen' }));

    await waitFor(() => expect(api.reopenComment).toHaveBeenCalledWith('prj_1', 'cmt_1'));
  });
});

describe('GddReview — a section that is no longer in the document', () => {
  it('keeps its thread readable under Removed sections rather than losing it', async () => {
    vi.mocked(api.listAnchoredCommentThreads).mockResolvedValue([
      thread({
        id: 'cmt_orphan',
        target: { type: 'entity', id: 'doc_1', anchor: REMOVED, versionId: null },
        body: 'This contradicts the pillars.',
      }),
    ]);
    vi.mocked(api.listCommentThreads).mockImplementation(async (_projectId, target) =>
      target.anchor === REMOVED
        ? [
            thread({
              id: 'cmt_orphan',
              target: { type: 'entity', id: 'doc_1', anchor: REMOVED, versionId: null },
              body: 'This contradicts the pillars.',
            }),
          ]
        : [],
    );

    renderReview();

    const removed = await screen.findByRole('region', { name: 'Removed sections' });
    await waitFor(() =>
      expect(within(removed).getByText('This contradicts the pillars.')).toBeDefined(),
    );
    // A thread whose section has gone still reads, and can still be dealt with.
    expect(within(removed).getByRole('button', { name: 'Resolve' })).toBeDefined();
  });

  it('shows the decision it carried, labelled as belonging to a removed section', async () => {
    vi.mocked(api.listAnchoredReviewStatuses).mockResolvedValue([
      {
        anchor: REMOVED,
        state: 'approved',
        decision: {
          id: 'dec_1',
          projectId: 'prj_1',
          target: { type: 'entity', id: 'doc_1', anchor: REMOVED, versionId: null },
          state: 'approved',
          actor: 'Ada',
          note: null,
          decidedAt: new Date('2026-03-01T09:00:00.000Z'),
        },
      },
    ]);

    renderReview();

    const removed = await screen.findByRole('region', { name: 'Removed sections' });
    expect(within(removed).getByText(/for a section no longer in the document/)).toBeDefined();
  });

  it('says nothing about removed sections while every anchor still matches', async () => {
    vi.mocked(api.listAnchoredReviewStatuses).mockResolvedValue([anchored(CORE_LOOP, 'approved')]);

    renderReview();

    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
    expect(screen.queryByRole('region', { name: 'Removed sections' })).toBeNull();
  });
});
