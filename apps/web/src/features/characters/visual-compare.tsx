'use client';

import { assetDifferences, type Asset, type Generation } from '@level-zero/domain';
import { Button, CompareView, Field, Select, Tag, type CompareSide } from '@level-zero/ui';
import { useState } from 'react';

import { assetContentUrl } from '@/lib/api';

import { useAssetProvenance } from './use-characters';

/**
 * Two of a character's pictures, side by side (spec section 61).
 *
 * A "variant" here is any two images the same character points at: the
 * portrait and the outfit re-roll are both `asset_reference` edges off one
 * entity, and that shared link is the only lineage the data actually has. The
 * pictures are the comparison; the differences are what a viewer cannot see —
 * shape, size, and the prompt, model and seed behind anything generated.
 *
 * Read only, and deliberately without a "choose this one" action: an asset has
 * no version history to restore and no promotion to make, so offering one
 * would be a button that does nothing the data supports.
 */
export function VisualCompare({
  projectId,
  images,
  onClose,
}: {
  projectId: string;
  /** The character's pictures that actually resolve to a file. */
  images: readonly Asset[];
  onClose: () => void;
}) {
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);

  const a = images.find((image) => image.id === aId) ?? images[0];
  const b = images.find((image) => image.id === bId) ?? images[1];

  const provenanceA = useAssetProvenance(projectId, a?.id ?? null);
  const provenanceB = useAssetProvenance(projectId, b?.id ?? null);

  if (!a || !b) return null;

  const groups = assetDifferences(
    { asset: a, generation: provenanceA.data ?? null },
    { asset: b, generation: provenanceB.data ?? null },
  );

  const side = (asset: Asset, generation: Generation | null): CompareSide => ({
    label: asset.filename,
    meta: generation ? `Generated · ${generation.model ?? generation.capability}` : 'Uploaded',
    children: (
      <div className="flex flex-col gap-3">
        <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-md bg-raised">
          <img
            src={assetContentUrl(projectId, asset.id)}
            alt={asset.filename}
            className="size-full object-contain"
          />
        </div>
        {asset.status === 'archived' && <Tag>Archived</Tag>}
        {generation && <p className="text-sm text-muted-foreground">{generation.prompt}</p>}
      </div>
    ),
  });

  return (
    <div className="flex flex-col gap-3">
      <CompareView
        a={side(a, provenanceA.data ?? null)}
        b={side(b, provenanceB.data ?? null)}
        groups={groups}
        sameLabel="These two files agree on everything recorded about them."
        toolbar={
          <div className="flex flex-wrap items-end gap-3">
            <Field label="A" htmlFor="visual-compare-a">
              <Select
                id="visual-compare-a"
                value={a.id}
                onChange={(event) => setAId(event.target.value)}
              >
                {images.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.filename}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="B" htmlFor="visual-compare-b">
              <Select
                id="visual-compare-b"
                value={b.id}
                onChange={(event) => setBId(event.target.value)}
              >
                {images.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.filename}
                  </option>
                ))}
              </Select>
            </Field>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setAId(b.id);
                setBId(a.id);
              }}
            >
              Swap sides
            </Button>

            <Button variant="ghost" size="sm" onClick={onClose}>
              Back to visuals
            </Button>
          </div>
        }
      />
    </div>
  );
}
