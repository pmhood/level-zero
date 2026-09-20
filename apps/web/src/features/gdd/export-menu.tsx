'use client';

import { Button, DownloadIcon } from '@level-zero/ui';
import { useEffect, useRef, useState } from 'react';

import type { DocumentExportFormat } from './gdd-export';

/**
 * The header's Export action (issue #190): one button, a small menu of the
 * two formats the document can leave as. The popover mechanics mirror
 * `DocumentSwitcher` — the other menu already living in this header — rather
 * than introducing a second way to build one.
 */
export function ExportMenu({ onExport }: { onExport: (format: DocumentExportFormat) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function choose(format: DocumentExportFormat) {
    setOpen(false);
    onExport(format);
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <DownloadIcon className="size-4" />
        Export
      </Button>

      {open && (
        <div
          role="menu"
          aria-label="Export"
          className="absolute right-0 top-full z-20 mt-2 w-48 rounded-lg border border-border bg-raised p-1 shadow-[var(--lz-shadow-floating)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => choose('markdown')}
            className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-hover"
          >
            Markdown (.md)
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => choose('html')}
            className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-hover"
          >
            HTML (.html)
          </button>
        </div>
      )}
    </div>
  );
}
