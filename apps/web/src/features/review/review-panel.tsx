'use client';

import type { ReviewDecision, ReviewStatus } from '@level-zero/domain';
import { Button, Field, StatusBadge, Textarea } from '@level-zero/ui';
import { useId, useState } from 'react';

import { apiErrorMessage, type ReviewTargetParams } from '@/lib/api';

import {
  ACTING_AS,
  formatDecidedAt,
  reviewActionLabel,
  reviewActionsFor,
  reviewStateBadge,
  reviewTargetTypeLabel,
  type ReviewAction,
} from './review';
import { useRecordReviewDecision, useReviewHistory, useReviewStatus } from './use-review';

/**
 * Where this piece of work stands, what a reviewer can do about it, and the
 * record of every decision so far.
 *
 * Approving and rejecting are ordinary actions, so they are ordinary buttons —
 * the AI purple is reserved for generative work and nothing here generates
 * anything. Nothing in this panel edits the thing under review either: a
 * decision is its own row, and the history below is append-only.
 */
export function ReviewPanel({
  projectId,
  target,
}: {
  projectId: string;
  target: ReviewTargetParams;
}) {
  const status = useReviewStatus(projectId, target);
  const history = useReviewHistory(projectId, target);
  const decide = useRecordReviewDecision(projectId, target);
  // One panel can be on screen more than once — an entity and the file it
  // references — so the note's label needs an id of its own.
  const noteId = useId();
  const [note, setNote] = useState('');

  if (status.isPending) {
    return <p className="text-sm text-muted-foreground">Loading review state…</p>;
  }
  if (status.isError || !status.data) {
    return <p className="text-sm text-error">{apiErrorMessage(status.error)}</p>;
  }

  const badge = reviewStateBadge(status.data.state);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        <DecidedBy decision={status.data.decision} />
      </div>

      <TargetNote status={status.data} target={target} />
      <StaleNote decision={status.data.staleDecision} />

      {status.data.target !== null && (
        <Field
          label="Note"
          htmlFor={noteId}
          hint="Optional, and kept verbatim with the decision below."
        >
          <Textarea
            id={noteId}
            className="min-h-[60px]"
            placeholder="Why, in your words."
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {reviewActionsFor(status.data.state).map((action) => (
          <Button
            key={action}
            type="button"
            variant={variantFor(action)}
            size="sm"
            disabled={decide.isPending || status.data.target === null}
            onClick={() =>
              decide.mutate(
                { state: action, actor: ACTING_AS, note: note.trim() || undefined },
                { onSuccess: () => setNote('') },
              )
            }
          >
            {reviewActionLabel(action)}
          </Button>
        ))}
      </div>

      {decide.isError && (
        <p className="text-xs text-error">
          {apiErrorMessage(decide.error, 'Could not record that decision.')}
        </p>
      )}

      {history.data && history.data.length > 0 && <History decisions={history.data} />}
    </div>
  );
}

function variantFor(action: ReviewAction): 'primary' | 'secondary' | 'danger' {
  if (action === 'approved') return 'primary';
  if (action === 'rejected') return 'danger';
  return 'secondary';
}

function DecidedBy({ decision }: { decision: ReviewDecision | null }) {
  if (!decision)
    return <span className="text-xs text-faint-foreground">Nobody has reviewed this yet.</span>;

  return (
    <span className="text-xs text-faint-foreground">
      {decision.actor} · {formatDecidedAt(decision.decidedAt)}
    </span>
  );
}

/**
 * What is left to say about a target that is no longer ordinary: archived, or
 * gone. A thread and its history outlive both, so this explains the state
 * rather than hiding the conversation.
 */
function TargetNote({ status, target }: { status: ReviewStatus; target: ReviewTargetParams }) {
  if (status.target === null) {
    return (
      <p className="text-xs text-muted-foreground">
        This {reviewTargetTypeLabel(target.targetType)} is no longer available. Its review history
        is kept below; nothing new can be recorded against it.
      </p>
    );
  }
  if (status.target.archived) {
    return (
      <p className="text-xs text-muted-foreground">
        {status.target.label} is archived. Comments and decisions still read, and still apply if it
        is restored.
      </p>
    );
  }
  return null;
}

/** The approval that no longer carries, because the work moved on past it. */
function StaleNote({ decision }: { decision: ReviewDecision | null }) {
  if (!decision) return null;

  return (
    <p className="text-xs text-warning">
      {reviewStateBadge(decision.state).label} by {decision.actor} on an earlier version. This
      version has not been reviewed.
    </p>
  );
}

function History({ decisions }: { decisions: readonly ReviewDecision[] }) {
  return (
    <section aria-label="Review history" className="flex flex-col gap-1.5">
      <h4 className="text-xs font-medium text-muted-foreground">Review history</h4>
      <ul className="flex flex-col gap-1.5">
        {decisions.map((decision) => (
          <li key={decision.id} className="flex flex-col gap-0.5">
            <p className="text-xs text-foreground">
              {reviewStateBadge(decision.state).label} · {decision.actor} ·{' '}
              {formatDecidedAt(decision.decidedAt)}
              {decision.target.versionId ? ' · on the version then current' : ''}
            </p>
            {decision.note && <p className="text-xs text-faint-foreground">{decision.note}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
