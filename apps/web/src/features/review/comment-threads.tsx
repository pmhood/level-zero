'use client';

import type { Comment, CommentThread } from '@level-zero/domain';
import { Button, StatusBadge, Textarea } from '@level-zero/ui';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage, type ReviewTargetParams } from '@/lib/api';

import { ACTING_AS, formatDecidedAt } from './review';
import {
  useCommentThreads,
  useCreateComment,
  useDeleteComment,
  useReopenComment,
  useReplyToComment,
  useResolveComment,
  useUpdateComment,
} from './use-review';

/**
 * The conversation about one target: its threads, oldest first, and one box to
 * start another.
 *
 * Comment bodies are plain text. Rich text in this product is the material
 * being designed — a GDD, lore, a character's background — and goes through
 * `RichTextEditor`; a remark about that material is a sentence or two, so this
 * is a `Textarea`.
 */
export function CommentThreads({
  projectId,
  target,
  canComment = true,
}: {
  projectId: string;
  target: ReviewTargetParams;
  /** False when the target has gone: the threads still read, nothing new lands. */
  canComment?: boolean;
}) {
  const threads = useCommentThreads(projectId, target);
  const create = useCreateComment(projectId, target);
  const [body, setBody] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;

    create.mutate({ author: ACTING_AS, body: text }, { onSuccess: () => setBody('') });
  }

  return (
    <div className="flex flex-col gap-3">
      {threads.isPending && <p className="text-sm text-muted-foreground">Loading comments…</p>}
      {threads.isError && <p className="text-sm text-error">{apiErrorMessage(threads.error)}</p>}

      {threads.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}

      {threads.data && threads.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {threads.data.map((thread) => (
            <li key={thread.comment.id}>
              <Thread projectId={projectId} target={target} thread={thread} />
            </li>
          ))}
        </ul>
      )}

      {canComment && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <Textarea
            aria-label="Add a comment"
            placeholder="Leave a comment for whoever reads this next."
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={!body.trim() || create.isPending}>
              {create.isPending ? 'Posting…' : 'Comment'}
            </Button>
            {create.isError && (
              <p className="text-xs text-error">
                {apiErrorMessage(create.error, 'Could not post that comment.')}
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function Thread({
  projectId,
  target,
  thread,
}: {
  projectId: string;
  target: ReviewTargetParams;
  thread: CommentThread;
}) {
  const resolve = useResolveComment(projectId, target);
  const reopen = useReopenComment(projectId, target);
  const reply = useReplyToComment(projectId, target);
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const resolved = thread.comment.resolvedAt !== null;

  function submitReply(event: FormEvent) {
    event.preventDefault();
    const text = replyBody.trim();
    if (!text) return;

    reply.mutate(
      { commentId: thread.comment.id, author: ACTING_AS, body: text },
      {
        onSuccess: () => {
          setReplyBody('');
          setReplying(false);
        },
      },
    );
  }

  return (
    // The thread's own address on the target's page, so a link can point at the
    // conversation and not just the thing: `…/entities/:id#comment-:commentId`.
    // The target is addressed by id, so renaming it leaves the link working.
    <div
      id={`comment-${thread.comment.id}`}
      className="flex flex-col gap-2 rounded-md border border-border-subtle bg-raised px-3 py-2.5"
    >
      <CommentBody projectId={projectId} target={target} comment={thread.comment} />

      {thread.replies.length > 0 && (
        <ul className="flex flex-col gap-2 border-l border-border-subtle pl-3">
          {thread.replies.map((item) => (
            <li key={item.id}>
              <CommentBody projectId={projectId} target={target} comment={item} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {resolved ? (
          <>
            <StatusBadge tone="success">Resolved</StatusBadge>
            <span className="text-xs text-faint-foreground">by {thread.comment.resolvedBy}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={reopen.isPending}
              onClick={() => reopen.mutate({ commentId: thread.comment.id })}
            >
              Reopen
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ commentId: thread.comment.id, actor: ACTING_AS })}
            >
              Resolve
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setReplying(!replying)}>
              Reply
            </Button>
          </>
        )}
      </div>

      {replying && !resolved && (
        <form onSubmit={submitReply} className="flex flex-col gap-2">
          <Textarea
            aria-label="Reply"
            value={replyBody}
            onChange={(event) => setReplyBody(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={!replyBody.trim() || reply.isPending}>
            {reply.isPending ? 'Replying…' : 'Reply'}
          </Button>
        </form>
      )}
    </div>
  );
}

/** One comment, with the two actions only its author may take. */
function CommentBody({
  projectId,
  target,
  comment,
}: {
  projectId: string;
  target: ReviewTargetParams;
  comment: Comment;
}) {
  const update = useUpdateComment(projectId, target);
  const remove = useDeleteComment(projectId, target);
  const [draft, setDraft] = useState<string | null>(null);
  const own = comment.author === ACTING_AS;

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    const text = draft?.trim();
    if (!text) return;

    update.mutate(
      { commentId: comment.id, actor: ACTING_AS, body: text },
      { onSuccess: () => setDraft(null) },
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-faint-foreground">
        {comment.author} · {formatDecidedAt(comment.createdAt)}
        {comment.updatedAt > comment.createdAt ? ' · edited' : ''}
      </p>

      {draft === null ? (
        <p className="whitespace-pre-wrap text-sm text-foreground">{comment.body}</p>
      ) : (
        <form onSubmit={submitEdit} className="flex flex-col gap-2">
          <Textarea
            aria-label="Edit comment"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={!draft.trim() || update.isPending}>
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {own && draft === null && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(comment.body)}>
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={remove.isPending}
            onClick={() => remove.mutate({ commentId: comment.id, actor: ACTING_AS })}
          >
            Delete
          </Button>
        </div>
      )}

      {(update.isError || remove.isError) && (
        <p className="text-xs text-error">
          {apiErrorMessage(update.error ?? remove.error, 'Could not change that comment.')}
        </p>
      )}
    </div>
  );
}
