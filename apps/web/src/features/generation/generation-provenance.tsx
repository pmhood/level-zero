'use client';

import type { Generation } from '@level-zero/domain';

import { apiErrorMessage } from '@/lib/api';

import { generationSummary } from './generation';
import { useGenerationProvenance } from './use-generation';

/**
 * How one result came to exist.
 *
 * Spec section 24 asks for provider, model, prompt, references and parent, and
 * asks that provenance not dominate the surface — so this is opened per result
 * rather than shown beside every tile. The entities and assets are resolved by
 * the API, which knows which of them the user named and which the relationship
 * walk brought in as ambient context.
 */
export function GenerationProvenanceDetails({
  projectId,
  generation,
}: {
  projectId: string;
  generation: Generation;
}) {
  const provenance = useGenerationProvenance(projectId, generation.id);

  if (provenance.isPending) {
    return <p className="text-xs text-faint-foreground">Reading provenance…</p>;
  }

  if (provenance.isError) {
    return (
      <p className="text-xs text-error">
        {apiErrorMessage(provenance.error, 'Could not read where this came from.')}
      </p>
    );
  }

  const { inputEntities, contextEntities, inputAssets, parent } = provenance.data;

  return (
    <dl className="flex flex-col gap-2 text-xs">
      <Row label="Generated">{generationSummary(generation)}</Row>
      <Row label="Prompt">
        <span className="text-foreground">{generation.prompt}</span>
      </Row>
      {generation.seed && <Row label="Seed">{generation.seed}</Row>}
      {inputAssets.length > 0 && (
        <Row label="References">{inputAssets.map((asset) => asset.filename).join(', ')}</Row>
      )}
      {inputEntities.length > 0 && (
        <Row label="Project objects">{inputEntities.map((entity) => entity.name).join(', ')}</Row>
      )}
      {contextEntities.length > 0 && (
        <Row label="Also in context">{contextEntities.map((entity) => entity.name).join(', ')}</Row>
      )}
      {parent && <Row label="Parent">{parent.prompt}</Row>}
    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-faint-foreground">{label}</dt>
      <dd className="min-w-0 text-muted-foreground">{children}</dd>
    </div>
  );
}
