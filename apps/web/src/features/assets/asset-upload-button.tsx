'use client';

import { Button } from '@level-zero/ui';
import { useRef } from 'react';

import { UploadIcon } from './asset-view-icons';

export interface AssetUploadButtonProps {
  onFilesSelected: (files: FileList) => void;
}

/**
 * The file-picker half of #174's upload surface — the drop target is the
 * library body itself (`assets-workspace.tsx`). Lives in `WorkspacePage`'s
 * `actions` slot beside the title, not the filter/sort toolbar below it.
 */
export function AssetUploadButton({ onFilesSelected }: AssetUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button variant="secondary" onClick={() => inputRef.current?.click()}>
        <UploadIcon className="size-4" />
        Upload files
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        aria-label="Upload files"
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) {
            onFilesSelected(event.target.files);
          }
          // Reset so choosing the exact same file again still fires onChange.
          event.target.value = '';
        }}
      />
    </>
  );
}
