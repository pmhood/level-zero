'use client';

import { SectionPanel } from '@level-zero/ui';

import type { ReviewTargetParams } from '@/lib/api';

import { CommentThreads } from './comment-threads';
import { ReviewPanel } from './review-panel';
import { useReviewStatus } from './use-review';

/**
 * The review surface for one target: where it stands, and what people have said
 * about it.
 *
 * One component for every kind of reviewable thing, because a review reads the
 * same whether it is about a character, a file or a prototype version — the
 * target is a parameter, not a variant. Mounted by whichever workspace owns the
 * thing being shown.
 */
export function ReviewSection({
  projectId,
  target,
  title = 'Review',
  description,
}: {
  projectId: string;
  target: ReviewTargetParams;
  title?: string;
  description?: string;
}) {
  const status = useReviewStatus(projectId, target);

  return (
    <SectionPanel title={title} description={description}>
      <div className="flex flex-col gap-4">
        <ReviewPanel projectId={projectId} target={target} />
        <div className="border-t border-border-subtle pt-4">
          <CommentThreads
            projectId={projectId}
            target={target}
            canComment={Boolean(status.data?.target)}
          />
        </div>
      </div>
    </SectionPanel>
  );
}
