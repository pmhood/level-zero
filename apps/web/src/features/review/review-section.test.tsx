// @vitest-environment jsdom
import type { Comment, CommentThread, ReviewDecision, ReviewStatus } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReviewSection } from './review-section';

vi.mock('@/lib/api', () => ({
  apiErrorMessage: (error: unknown, fallback = 'Something went wrong talking to the API.') =>
    error instanceof Error ? error.message : fallback,
  listCommentThreads: vi.fn(),
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

const target = { targetType: 'entity', targetId: 'ent_diver' } as const;

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'cmt_1',
    projectId: 'prj_1',
    target: { type: 'entity', id: 'ent_diver', anchor: null, versionId: null },
    parentCommentId: null,
    author: 'You',
    body: 'The oxygen drain reads high.',
    resolvedAt: null,
    resolvedBy: null,
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    updatedAt: new Date('2026-03-01T09:00:00.000Z'),
    ...overrides,
  };
}

function thread(overrides: Partial<CommentThread> = {}): CommentThread {
  return { comment: comment(), replies: [], ...overrides };
}

function decision(overrides: Partial<ReviewDecision> = {}): ReviewDecision {
  return {
    id: 'dec_1',
    projectId: 'prj_1',
    target: { type: 'entity', id: 'ent_diver', anchor: null, versionId: 'ver_1' },
    state: 'approved',
    actor: 'Ada',
    note: null,
    decidedAt: new Date('2026-03-01T09:00:00.000Z'),
    ...overrides,
  };
}

function status(overrides: Partial<ReviewStatus> = {}): ReviewStatus {
  return {
    target: {
      target: { type: 'entity', id: 'ent_diver', anchor: null, versionId: null },
      label: 'The Diver',
      archived: false,
      currentVersionId: 'ver_2',
    },
    state: 'draft',
    decision: null,
    staleDecision: null,
    ...overrides,
  };
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ReviewSection projectId="prj_1" target={target} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getReviewStatus).mockResolvedValue(status());
  vi.mocked(api.listReviewHistory).mockResolvedValue([]);
  vi.mocked(api.listCommentThreads).mockResolvedValue([]);
});

afterEach(cleanup);

describe('ReviewPanel', () => {
  it('shows the state and the actions that move it on', async () => {
    renderSection();

    expect(await screen.findByText('Draft')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Request review' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();
  });

  it('records an approval as an explicit act with an actor', async () => {
    vi.mocked(api.recordReviewDecision).mockResolvedValue(decision());
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(api.recordReviewDecision).toHaveBeenCalledWith('prj_1', {
        ...target,
        state: 'approved',
        actor: 'You',
      }),
    );
  });

  it('says an approval of an earlier version does not cover this one', async () => {
    vi.mocked(api.getReviewStatus).mockResolvedValue(
      status({ state: 'draft', staleDecision: decision() }),
    );
    renderSection();

    expect(await screen.findByText(/Approved by Ada on an earlier version/)).toBeTruthy();
  });

  it('keeps the history readable for a target that has gone, and refuses new decisions', async () => {
    vi.mocked(api.getReviewStatus).mockResolvedValue(
      status({ target: null, state: 'rejected', decision: decision({ state: 'rejected' }) }),
    );
    vi.mocked(api.listReviewHistory).mockResolvedValue([decision({ state: 'rejected' })]);
    renderSection();

    expect(await screen.findByText(/no longer available/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByLabelText('Add a comment')).toBeNull();
  });

  it('explains an archived target rather than hiding its thread', async () => {
    vi.mocked(api.getReviewStatus).mockResolvedValue(
      status({
        target: {
          target: { type: 'entity', id: 'ent_diver', anchor: null, versionId: null },
          label: 'The Diver',
          archived: true,
          currentVersionId: null,
        },
      }),
    );
    vi.mocked(api.listCommentThreads).mockResolvedValue([thread()]);
    renderSection();

    expect(await screen.findByText(/The Diver is archived/)).toBeTruthy();
    expect(screen.getByText('The oxygen drain reads high.')).toBeTruthy();
  });
});

describe('CommentThreads', () => {
  it('posts a comment on the target', async () => {
    vi.mocked(api.createComment).mockResolvedValue(comment());
    renderSection();

    fireEvent.change(await screen.findByLabelText('Add a comment'), {
      target: { value: 'Reads high for a first dive.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() =>
      expect(api.createComment).toHaveBeenCalledWith('prj_1', {
        ...target,
        author: 'You',
        body: 'Reads high for a first dive.',
      }),
    );
  });

  it('resolves a thread, recording who resolved it', async () => {
    vi.mocked(api.listCommentThreads).mockResolvedValue([thread()]);
    vi.mocked(api.resolveComment).mockResolvedValue(
      comment({ resolvedAt: new Date('2026-03-02'), resolvedBy: 'You' }),
    );
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: 'Resolve' }));

    await waitFor(() => expect(api.resolveComment).toHaveBeenCalledWith('prj_1', 'cmt_1', 'You'));
  });

  it('offers reopen on a resolved thread instead of resolve', async () => {
    vi.mocked(api.listCommentThreads).mockResolvedValue([
      thread({ comment: comment({ resolvedAt: new Date('2026-03-02'), resolvedBy: 'Ada' }) }),
    ]);
    renderSection();

    expect(await screen.findByText('Resolved')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
  });

  it('offers edit and delete on your own comment only', async () => {
    vi.mocked(api.listCommentThreads).mockResolvedValue([
      thread({ comment: comment({ id: 'cmt_2', author: 'Ada' }) }),
    ]);
    renderSection();

    await screen.findByText('The oxygen drain reads high.');
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('shows replies under the comment that started the thread', async () => {
    vi.mocked(api.listCommentThreads).mockResolvedValue([
      thread({
        replies: [
          comment({ id: 'cmt_2', parentCommentId: 'cmt_1', author: 'Ada', body: 'Halved it.' }),
        ],
      }),
    ]);
    renderSection();

    expect(await screen.findByText('Halved it.')).toBeTruthy();
  });
});
