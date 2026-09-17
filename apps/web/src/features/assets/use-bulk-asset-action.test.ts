// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@/lib/api';

import { useBulkAssetAction } from './use-bulk-asset-action';

describe('useBulkAssetAction', () => {
  it('runs the action once per id and reports every success', async () => {
    const { result } = renderHook(() => useBulkAssetAction());
    const action = vi.fn(async (assetId: string) => `done:${assetId}`);

    let outcome;
    await act(async () => {
      outcome = await result.current.run(['a', 'b', 'c'], action);
    });

    expect(action).toHaveBeenCalledTimes(3);
    expect(outcome).toEqual({ succeededIds: ['a', 'b', 'c'], failures: [] });
  });

  it("reports which ids failed and why, without stopping the ones that didn't", async () => {
    const { result } = renderHook(() => useBulkAssetAction());
    const action = vi.fn(async (assetId: string) => {
      if (assetId === 'b') throw new ApiRequestError('Asset is already archived', 409);
      return assetId;
    });

    let outcome;
    await act(async () => {
      outcome = await result.current.run(['a', 'b', 'c'], action);
    });

    expect(outcome).toEqual({
      succeededIds: ['a', 'c'],
      failures: [{ assetId: 'b', message: 'Asset is already archived' }],
    });
  });

  it('is harmless to run twice over the same ids — repeating a successful action is not an error', async () => {
    const { result } = renderHook(() => useBulkAssetAction());
    const action = vi.fn(async (assetId: string) => assetId);

    await act(async () => {
      await result.current.run(['a', 'b'], action);
    });
    let second;
    await act(async () => {
      second = await result.current.run(['a', 'b'], action);
    });

    expect(action).toHaveBeenCalledTimes(4);
    expect(second).toEqual({ succeededIds: ['a', 'b'], failures: [] });
  });
});
