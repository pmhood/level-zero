import { describe, expect, it } from 'vitest';

import { type Asset } from '../asset/asset';
import { type Generation } from '../generation/generation';
import { FILE_GROUP, PROVENANCE_GROUP, assetDifferences } from './asset-differences';

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'ast_1',
    projectId: 'prj_1',
    kind: 'image',
    filename: 'kael-portrait.png',
    mimeType: 'image/png',
    byteSize: 2048,
    storageKey: 'projects/prj_1/kael-portrait.png',
    checksum: 'abc',
    width: 1024,
    height: 1024,
    durationSeconds: null,
    variant: 'source',
    sourceAssetId: null,
    status: 'active',
    pipelineStage: 'concept',
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    updatedAt: new Date('2026-03-01T09:00:00.000Z'),
    archivedAt: null,
    createdBy: null,
    ...overrides,
  };
}

function generation(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'gen_1',
    projectId: 'prj_1',
    capability: 'image.generate',
    provider: 'openai',
    model: 'image-1',
    prompt: 'A rugged salvage diver, weathered helmet',
    parameters: {},
    status: 'complete',
    inputEntityIds: [],
    inputAssetIds: [],
    contextEntityIds: [],
    resolvedContext: null,
    outputAssetIds: ['ast_1'],
    parentGenerationId: null,
    seed: '1234',
    providerRequestId: null,
    failure: null,
    attempts: [],
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    createdBy: null,
    ...overrides,
  };
}

describe('asset differences', () => {
  it('says nothing about two identical files', () => {
    expect(assetDifferences({ asset: asset() }, { asset: asset({ id: 'ast_2' }) })).toEqual([]);
  });

  it('reads size and shape the way a viewer would say them', () => {
    const groups = assetDifferences(
      { asset: asset() },
      { asset: asset({ id: 'ast_2', width: 1536, height: 2048, byteSize: 3_145_728 }) },
    );

    expect(groups).toEqual([
      {
        title: FILE_GROUP,
        differences: [
          {
            key: 'dimensions',
            label: 'Dimensions',
            change: 'changed',
            from: '1024 × 1024',
            to: '1536 × 2048',
          },
          { key: 'byteSize', label: 'File size', change: 'changed', from: '2.0 kB', to: '3.0 MB' },
        ],
      },
    ]);
  });

  it('shows what separates two variants of the same generation', () => {
    const groups = assetDifferences(
      { asset: asset(), generation: generation() },
      {
        asset: asset({ id: 'ast_2' }),
        generation: generation({
          id: 'gen_2',
          prompt: 'A rugged salvage diver, cracked helmet',
          seed: '9876',
        }),
      },
    );

    expect(groups).toEqual([
      {
        title: PROVENANCE_GROUP,
        differences: [
          {
            key: 'prompt',
            label: 'Prompt',
            change: 'changed',
            from: 'A rugged salvage diver, weathered helmet',
            to: 'A rugged salvage diver, cracked helmet',
          },
          { key: 'seed', label: 'Seed', change: 'changed', from: '1234', to: '9876' },
        ],
      },
    ]);
  });

  it('reads an upload against a generated image as provenance one side lacks', () => {
    const groups = assetDifferences(
      { asset: asset(), generation: null },
      { asset: asset({ id: 'ast_2' }), generation: generation() },
    );

    expect(groups).toEqual([
      {
        title: PROVENANCE_GROUP,
        differences: [
          {
            key: 'prompt',
            label: 'Prompt',
            change: 'added',
            from: null,
            to: 'A rugged salvage diver, weathered helmet',
          },
          { key: 'model', label: 'Model', change: 'added', from: null, to: 'image-1' },
          { key: 'provider', label: 'Provider', change: 'added', from: null, to: 'openai' },
          { key: 'seed', label: 'Seed', change: 'added', from: null, to: '1234' },
        ],
      },
    ]);
  });

  it('reports an archived file against an active one', () => {
    const groups = assetDifferences(
      { asset: asset() },
      { asset: asset({ id: 'ast_2', status: 'archived' }) },
    );

    expect(groups[0]?.differences).toEqual([
      { key: 'status', label: 'Status', change: 'changed', from: 'active', to: 'archived' },
    ]);
  });
});
