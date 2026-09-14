'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import * as api from '@/lib/api';

import { checkFile, readFileAsBase64, readFileMetadata } from './asset-upload';
import { assetKeys } from './use-assets';

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed';

export interface UploadItem {
  readonly id: string;
  readonly file: File;
  readonly status: UploadStatus;
  /** 0–1 while `status` is `'uploading'`; meaningless otherwise. */
  readonly progress: number;
  readonly error?: string;
}

/**
 * Uploads run a few at a time rather than all at once a drop lands, so
 * dragging in a folder of files doesn't open dozens of simultaneous
 * multi-megabyte requests — this is also what gives a freshly dropped file a
 * visible `'queued'` moment rather than jumping straight to `'uploading'`.
 */
const MAX_CONCURRENT_UPLOADS = 3;

let nextUploadId = 0;

function uploadErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Upload failed.';
}

/**
 * Drives the asset library's upload queue (issue #174): one entry per file,
 * each with its own status, progress and error, so uploading several files
 * never fails as one batch and a stuck one doesn't block the rest.
 *
 * `itemsRef` is the actual source of truth, mutated synchronously; `items`
 * (the returned `useState`) only mirrors it for rendering. `pump`'s
 * concurrency loop needs to see every state change the instant it happens —
 * React's own state queue makes no promise about when a `setState` updater
 * actually runs, and `pump` spinning on a read that hasn't caught up yet is
 * an infinite loop, not a stale render.
 *
 * A finished upload invalidates the same query key `useArchiveAsset` and
 * `useRestoreAsset` do, so the new asset shows up in whatever page and
 * filters the library already has open, without a full reload.
 */
export function useAssetUpload(projectId: string) {
  const itemsRef = useRef<UploadItem[]>([]);
  const [items, setItems] = useState<UploadItem[]>([]);
  const activeCountRef = useRef(0);
  const controllersRef = useRef(new Map<string, AbortController>());
  const queryClient = useQueryClient();

  const render = useCallback(() => setItems([...itemsRef.current]), []);

  const updateItem = useCallback(
    (id: string, patch: Partial<UploadItem>) => {
      itemsRef.current = itemsRef.current.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      );
      render();
    },
    [render],
  );

  const upload = useCallback(
    async (id: string, file: File) => {
      const controller = new AbortController();
      controllersRef.current.set(id, controller);

      try {
        const checked = checkFile(file);
        if ('reason' in checked) throw new Error(checked.reason);

        const metadata = await readFileMetadata(file, checked.kind);
        const contentBase64 = await readFileAsBase64(file);

        await api.uploadAsset(
          projectId,
          {
            kind: checked.kind,
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            contentBase64,
            ...metadata,
          },
          {
            signal: controller.signal,
            onProgress: (fraction) => updateItem(id, { progress: fraction }),
          },
        );

        updateItem(id, { status: 'done', progress: 1 });
        await queryClient.invalidateQueries({ queryKey: assetKeys.all(projectId) });
      } catch (error) {
        updateItem(id, { status: 'failed', error: uploadErrorMessage(error) });
      } finally {
        controllersRef.current.delete(id);
      }
    },
    [projectId, queryClient, updateItem],
  );

  /** Starts queued items up to the concurrency cap; called after every change that could free or fill a slot. */
  const pump = useCallback(() => {
    while (activeCountRef.current < MAX_CONCURRENT_UPLOADS) {
      const next = itemsRef.current.find((item) => item.status === 'queued');
      if (!next) return;

      activeCountRef.current += 1;
      updateItem(next.id, { status: 'uploading', progress: 0, error: undefined });
      void upload(next.id, next.file).finally(() => {
        activeCountRef.current -= 1;
        pump();
      });
    }
  }, [updateItem, upload]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newItems: UploadItem[] = Array.from(files).map((file) => ({
        id: `upload_${(nextUploadId += 1)}`,
        file,
        status: 'queued',
        progress: 0,
      }));
      if (newItems.length === 0) return;

      itemsRef.current = [...itemsRef.current, ...newItems];
      render();
      pump();
    },
    [pump, render],
  );

  const retry = useCallback(
    (id: string) => {
      updateItem(id, { status: 'queued', progress: 0, error: undefined });
      pump();
    },
    [pump, updateItem],
  );

  const dismiss = useCallback(
    (id: string) => {
      controllersRef.current.get(id)?.abort();
      controllersRef.current.delete(id);
      itemsRef.current = itemsRef.current.filter((item) => item.id !== id);
      render();
    },
    [render],
  );

  return { items, addFiles, retry, dismiss };
}
