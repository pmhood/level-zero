import { type Asset } from '../asset/asset';
import { type Generation } from '../generation/generation';
import { compactDifferences, describeValue, difference, type DifferenceGroup } from './difference';

export const FILE_GROUP = 'File';
export const PROVENANCE_GROUP = 'How it was made';

/**
 * One side of an asset comparison: the file, and the act that produced it.
 *
 * The generation is passed in rather than looked up because an asset is not an
 * entity and carries no link back — provenance is read the other way, by
 * finding the generation whose output this asset is.
 */
export interface AssetComparisonSide {
  asset: Asset;
  /** The generation that produced it, or null for an upload. */
  generation?: Generation | null;
}

/**
 * How two pictures differ, beyond looking at them.
 *
 * The images themselves are the comparison — this is the part a viewer cannot
 * see: what shape and size each file is, and, for anything generated, the
 * prompt, model and seed that produced it. Two variants of the same portrait
 * usually differ in one line of prompt, and that is the line worth reading.
 */
export function assetDifferences(
  from: AssetComparisonSide,
  to: AssetComparisonSide,
): DifferenceGroup[] {
  const file = compactDifferences([
    difference('kind', 'Kind', from.asset.kind, to.asset.kind),
    difference('mimeType', 'Format', from.asset.mimeType, to.asset.mimeType),
    difference('dimensions', 'Dimensions', dimensions(from.asset), dimensions(to.asset)),
    difference('byteSize', 'File size', fileSize(from.asset), fileSize(to.asset)),
    difference('variant', 'Variant', from.asset.variant, to.asset.variant),
    difference('status', 'Status', from.asset.status, to.asset.status),
  ]);

  const provenance = compactDifferences([
    difference('prompt', 'Prompt', prompt(from), prompt(to)),
    difference('model', 'Model', from.generation?.model ?? null, to.generation?.model ?? null),
    difference(
      'provider',
      'Provider',
      from.generation?.provider ?? null,
      to.generation?.provider ?? null,
    ),
    difference('seed', 'Seed', from.generation?.seed ?? null, to.generation?.seed ?? null),
  ]);

  return [
    ...(file.length > 0 ? [{ title: FILE_GROUP, differences: file }] : []),
    ...(provenance.length > 0 ? [{ title: PROVENANCE_GROUP, differences: provenance }] : []),
  ];
}

function prompt(side: AssetComparisonSide): string | null {
  return side.generation ? describeValue(side.generation.prompt) : null;
}

function dimensions(asset: Asset): string | null {
  return asset.width !== null && asset.height !== null ? `${asset.width} × ${asset.height}` : null;
}

function fileSize(asset: Asset): string {
  if (asset.byteSize < 1024) return `${asset.byteSize} B`;
  const kilobytes = asset.byteSize / 1024;
  if (kilobytes < 1024) return `${round(kilobytes)} kB`;
  return `${round(kilobytes / 1024)} MB`;
}

function round(value: number): string {
  return value < 10 ? value.toFixed(1) : String(Math.round(value));
}
