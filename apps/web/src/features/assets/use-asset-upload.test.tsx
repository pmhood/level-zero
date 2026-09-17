// @vitest-environment jsdom
import type { Asset } from '@level-zero/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssetUpload } from './use-asset-upload';

vi.mock('@/lib/api', () => ({
  uploadAsset: vi.fn(),
}));

// `asset-upload.ts`'s metadata reading goes through browser media decoding
// jsdom doesn't implement (`Image`, `HTMLVideoElement`); this hook's own job
// is orchestrating the queue around whatever that module reports, so its
// tests stub the module rather than faking image/video decode.
vi.mock('./asset-upload', () => ({
  checkFile: vi.fn(),
  readFileMetadata: vi.fn(),
  readFileAsBase64: vi.fn(),
}));

const api = await import('@/lib/api');
const assetUpload = await import('./asset-upload');

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'ast_new',
    projectId: 'prj_1',
    kind: 'image',
    filename: 'ref.png',
    mimeType: 'image/png',
    byteSize: 1024,
    storageKey: 'projects/prj_1/assets/ast_new',
    checksum: 'abc',
    width: 800,
    height: 600,
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

function file(name: string, type = 'image/png'): File {
  return new File(['pretend bytes'], name, { type });
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assetUpload.checkFile).mockReturnValue({ kind: 'image' });
  vi.mocked(assetUpload.readFileMetadata).mockResolvedValue({ width: 800, height: 600 });
  vi.mocked(assetUpload.readFileAsBase64).mockResolvedValue('cHJldGVuZCBieXRlcw==');
});

describe('useAssetUpload', () => {
  it('uploads a queued file through to done, sending the derived kind and metadata', async () => {
    vi.mocked(api.uploadAsset).mockResolvedValue(asset());
    const { result } = renderHook(() => useAssetUpload('prj_1'), { wrapper });

    act(() => {
      result.current.addFiles([file('kael.png')]);
    });

    expect(result.current.items).toHaveLength(1);
    await waitFor(() => expect(result.current.items[0]?.status).toBe('done'));

    expect(api.uploadAsset).toHaveBeenCalledWith(
      'prj_1',
      {
        kind: 'image',
        filename: 'kael.png',
        mimeType: 'image/png',
        contentBase64: 'cHJldGVuZCBieXRlcw==',
        width: 800,
        height: 600,
      },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onProgress: expect.any(Function),
      }),
    );
  });

  it('rejects an unsupported type without calling the API', async () => {
    vi.mocked(assetUpload.checkFile).mockReturnValue({
      reason: '"application/zip" is not supported.',
    });
    const { result } = renderHook(() => useAssetUpload('prj_1'), { wrapper });

    act(() => {
      result.current.addFiles([file('archive.zip', 'application/zip')]);
    });

    await waitFor(() => expect(result.current.items[0]?.status).toBe('failed'));
    expect(result.current.items[0]?.error).toBe('"application/zip" is not supported.');
    expect(api.uploadAsset).not.toHaveBeenCalled();
  });

  it('fails one file without losing the others in the same batch', async () => {
    vi.mocked(api.uploadAsset).mockImplementation((_projectId, input) =>
      input.filename === 'broken.png'
        ? Promise.reject(new Error('Something went wrong talking to the API.'))
        : Promise.resolve(asset({ filename: input.filename })),
    );
    const { result } = renderHook(() => useAssetUpload('prj_1'), { wrapper });

    act(() => {
      result.current.addFiles([file('broken.png'), file('fine.png')]);
    });

    await waitFor(() => {
      expect(result.current.items.map((item) => item.status).sort()).toEqual(['done', 'failed']);
    });

    const failed = result.current.items.find((item) => item.file.name === 'broken.png');
    expect(failed?.error).toBe('Something went wrong talking to the API.');
  });

  it('re-uploads a failed file on retry', async () => {
    vi.mocked(api.uploadAsset).mockRejectedValueOnce(new Error('Service unavailable'));
    const { result } = renderHook(() => useAssetUpload('prj_1'), { wrapper });

    act(() => {
      result.current.addFiles([file('kael.png')]);
    });
    await waitFor(() => expect(result.current.items[0]?.status).toBe('failed'));

    vi.mocked(api.uploadAsset).mockResolvedValueOnce(asset());
    act(() => {
      result.current.retry(result.current.items[0]!.id);
    });

    await waitFor(() => expect(result.current.items[0]?.status).toBe('done'));
    expect(api.uploadAsset).toHaveBeenCalledTimes(2);
  });

  it('dismisses an item, removing it from the queue', async () => {
    vi.mocked(api.uploadAsset).mockResolvedValue(asset());
    const { result } = renderHook(() => useAssetUpload('prj_1'), { wrapper });

    act(() => {
      result.current.addFiles([file('kael.png')]);
    });
    await waitFor(() => expect(result.current.items[0]?.status).toBe('done'));

    act(() => {
      result.current.dismiss(result.current.items[0]!.id);
    });

    expect(result.current.items).toHaveLength(0);
  });

  it('scopes every upload to the project the hook was given', async () => {
    vi.mocked(api.uploadAsset).mockResolvedValue(asset());
    const { result } = renderHook(() => useAssetUpload('prj_belt'), { wrapper });

    act(() => {
      result.current.addFiles([file('kael.png')]);
    });

    await waitFor(() => expect(api.uploadAsset).toHaveBeenCalled());
    expect(vi.mocked(api.uploadAsset).mock.calls[0]![0]).toBe('prj_belt');
  });
});
