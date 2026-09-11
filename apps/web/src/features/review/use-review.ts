'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';

/**
 * One target, one cache key. Everything about a target — its threads, its state
 * and its history — invalidates together, because resolving a thread and
 * approving the work are two halves of the same screen.
 */
const reviewKeys = {
  target: (projectId: string, target: api.ReviewTargetParams) =>
    [
      'projects',
      projectId,
      'review',
      target.targetType,
      target.targetId,
      target.anchor ?? null,
    ] as const,
  threads: (projectId: string, target: api.ReviewTargetParams) =>
    [...reviewKeys.target(projectId, target), 'threads'] as const,
  status: (projectId: string, target: api.ReviewTargetParams) =>
    [...reviewKeys.target(projectId, target), 'status'] as const,
  history: (projectId: string, target: api.ReviewTargetParams) =>
    [...reviewKeys.target(projectId, target), 'history'] as const,
};

export function useCommentThreads(projectId: string, target: api.ReviewTargetParams) {
  return useQuery({
    queryKey: reviewKeys.threads(projectId, target),
    queryFn: () => api.listCommentThreads(projectId, target),
    enabled: Boolean(projectId) && Boolean(target.targetId),
  });
}

export function useReviewStatus(projectId: string, target: api.ReviewTargetParams) {
  return useQuery({
    queryKey: reviewKeys.status(projectId, target),
    queryFn: () => api.getReviewStatus(projectId, target),
    enabled: Boolean(projectId) && Boolean(target.targetId),
  });
}

export function useReviewHistory(projectId: string, target: api.ReviewTargetParams) {
  return useQuery({
    queryKey: reviewKeys.history(projectId, target),
    queryFn: () => api.listReviewHistory(projectId, target),
    enabled: Boolean(projectId) && Boolean(target.targetId),
  });
}

export function useCreateComment(projectId: string, target: api.ReviewTargetParams) {
  return useTargetMutation(projectId, target, (input: { author: string; body: string }) =>
    api.createComment(projectId, { ...target, ...input }),
  );
}

export function useReplyToComment(projectId: string, target: api.ReviewTargetParams) {
  return useTargetMutation(
    projectId,
    target,
    (input: { commentId: string; author: string; body: string }) =>
      api.replyToComment(projectId, input.commentId, { author: input.author, body: input.body }),
  );
}

export function useUpdateComment(projectId: string, target: api.ReviewTargetParams) {
  return useTargetMutation(
    projectId,
    target,
    (input: { commentId: string; actor: string; body: string }) =>
      api.updateComment(projectId, input.commentId, { actor: input.actor, body: input.body }),
  );
}

export function useDeleteComment(projectId: string, target: api.ReviewTargetParams) {
  return useTargetMutation(projectId, target, (input: { commentId: string; actor: string }) =>
    api.deleteComment(projectId, input.commentId, input.actor),
  );
}

export function useResolveComment(projectId: string, target: api.ReviewTargetParams) {
  return useTargetMutation(projectId, target, (input: { commentId: string; actor: string }) =>
    api.resolveComment(projectId, input.commentId, input.actor),
  );
}

export function useReopenComment(projectId: string, target: api.ReviewTargetParams) {
  return useTargetMutation(projectId, target, (input: { commentId: string }) =>
    api.reopenComment(projectId, input.commentId),
  );
}

/** Records one explicit act of review. Nothing else in the app writes this state. */
export function useRecordReviewDecision(projectId: string, target: api.ReviewTargetParams) {
  return useTargetMutation(
    projectId,
    target,
    (input: Omit<api.RecordReviewDecisionInput, keyof api.ReviewTargetParams>) =>
      api.recordReviewDecision(projectId, { ...target, ...input }),
  );
}

/** Every write on this screen refreshes the whole target: one rule, one place. */
function useTargetMutation<TInput, TResult>(
  projectId: string,
  target: api.ReviewTargetParams,
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewKeys.target(projectId, target) });
    },
  });
}
