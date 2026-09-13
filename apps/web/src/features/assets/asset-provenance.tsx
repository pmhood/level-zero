'use client';

import type { Asset, AssetSummary } from '@level-zero/domain';

import { GenerationProvenanceDetails } from '@/features/generation/generation-provenance';
import { apiErrorMessage } from '@/lib/api';

import { PropertyRow } from './asset-property-row';
import { useAssetGeneration } from './use-assets';

/**
 * How a generated file came to exist (spec section 24).
 *
 * Capability, provider, model, prompt, seed, the references it worked from and
 * the generation it re-rolls are all `GenerationProvenanceDetails`' answer, and
 * it is reused whole rather than restated here — the API resolves the input
 * assets and entities, and this surface would only get that wrong differently.
 * The parameters are the one thing it does not show, and they belong to the
 * request rather than to the provider.
 */
export function AssetProvenance({
  projectId,
  asset,
  summary,
}: {
  projectId: string;
  asset: Asset;
  summary: AssetSummary | undefined;
}) {
  const generation = useAssetGeneration(projectId, asset.id);

  if (summary?.origin === 'imported') {
    return (
      <p className="text-xs text-faint-foreground">
        This file was imported. Nothing generated it, so there is no prompt, model or seed to read.
      </p>
    );
  }

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

  if (!generation.data) {
    return (
      <p className="text-xs text-faint-foreground">No generation record points at this file.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <GenerationProvenanceDetails projectId={projectId} generation={generation.data} />
      <GenerationParameters parameters={generation.data.parameters} />
    </div>
  );
}

/** The knobs the request carried, exactly as they were asked for. */
function GenerationParameters({ parameters }: { parameters: Record<string, unknown> }) {
  const entries = Object.entries(parameters);
  if (entries.length === 0) return null;

  return (
    <section aria-label="Parameters" className="flex flex-col gap-1.5">
      <h4 className="text-xs font-semibold text-foreground">Parameters</h4>
      <dl className="flex flex-col gap-2 text-xs">
        {entries.map(([name, value]) => (
          <PropertyRow key={name} label={name}>
            {formatParameter(value)}
          </PropertyRow>
        ))}
      </dl>
    </section>
  );
}

function formatParameter(value: unknown): string {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}
