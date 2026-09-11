'use client';

import { Button, SparklesIcon, Tag, cn } from '@level-zero/ui';
import { useState } from 'react';

import { GenerationProvenanceDetails } from '@/features/generation/generation-provenance';
import { useGeneration } from '@/features/generation/use-generation';
import { apiErrorMessage } from '@/lib/api';

import { useOutcomeInterpretation } from './use-outcomes';

/**
 * Section 5 — one model's reading of the facts above, and nothing else on
 * this surface.
 *
 * It is asked for, never volunteered: everything above is measured, and
 * mixing a reading into it would make the two indistinguishable at a glance.
 * The purple frame is the AI language the style guide reserves for generated
 * material, the label says what it is in words, and the record behind it is
 * one click away — the same provenance any other generated output carries.
 */
export function OutcomeInterpretation({
  projectId,
  prototypeId,
  fromVersionId,
  toVersionId,
}: {
  projectId: string;
  prototypeId: string;
  fromVersionId: string;
  toVersionId: string;
}) {
  const interpretation = useOutcomeInterpretation(projectId, prototypeId);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Everything above is recorded evidence. This asks a model to read it and say what may relate
        to what — an interpretation, not a measurement, and never a cause.
      </p>

      <div>
        <Button
          type="button"
          variant="ai"
          size="sm"
          disabled={interpretation.isPending}
          onClick={() => interpretation.mutate({ from: fromVersionId, to: toVersionId })}
        >
          <SparklesIcon className="size-4" />
          {interpretation.isPending
            ? 'Reading…'
            : interpretation.data
              ? 'Read it again'
              : 'Interpret these results'}
        </Button>
      </div>

      {interpretation.isError && (
        <p className="text-sm text-error">
          {apiErrorMessage(interpretation.error, 'The model could not read these results.')}
        </p>
      )}

      {interpretation.data && (
        <Reading
          projectId={projectId}
          generationId={interpretation.data.generationId}
          text={interpretation.data.interpretation}
        />
      )}
    </div>
  );
}

function Reading({
  projectId,
  generationId,
  text,
}: {
  projectId: string;
  generationId: string;
  text: string;
}) {
  const [showProvenance, setShowProvenance] = useState(false);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border p-3',
        'border-[var(--lz-ai-border)] bg-[var(--lz-ai-muted)]',
      )}
    >
      <Tag
        className={cn(
          'gap-1 self-start border-[var(--lz-ai-border)] bg-[var(--lz-ai-muted)] text-ai-foreground',
        )}
      >
        <SparklesIcon className="size-3" />
        AI interpretation
      </Tag>

      {text.split(/\n{2,}/).map((paragraph) => (
        <p key={paragraph.slice(0, 40)} className="text-sm text-foreground">
          {paragraph}
        </p>
      ))}

      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowProvenance((shown) => !shown)}
        >
          {showProvenance ? 'Hide where this came from' : 'Where this came from'}
        </Button>
      </div>

      {showProvenance && <Provenance projectId={projectId} generationId={generationId} />}
    </div>
  );
}

function Provenance({ projectId, generationId }: { projectId: string; generationId: string }) {
  const generation = useGeneration(projectId, generationId);

  if (generation.isPending) {
    return <p className="text-xs text-faint-foreground">Reading provenance…</p>;
  }

  if (generation.isError) {
    return (
      <p className="text-xs text-error">
        {apiErrorMessage(generation.error, 'Could not read where this came from.')}
      </p>
    );
  }

  return <GenerationProvenanceDetails projectId={projectId} generation={generation.data} />;
}
