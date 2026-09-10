'use client';

import type { PointerEvent } from 'react';

import { RESIZE_HANDLES, type Box, type ResizeHandle } from './moodboard-geometry';

/** How far above the frame the rotate handle hangs, in screen pixels. */
const ROTATE_HANDLE_OFFSET = 28;
const HANDLE_SIZE = 9;

const HANDLE_POSITION: Record<ResizeHandle, { left: string; top: string; cursor: string }> = {
  nw: { left: '0%', top: '0%', cursor: 'nwse-resize' },
  n: { left: '50%', top: '0%', cursor: 'ns-resize' },
  ne: { left: '100%', top: '0%', cursor: 'nesw-resize' },
  e: { left: '100%', top: '50%', cursor: 'ew-resize' },
  se: { left: '100%', top: '100%', cursor: 'nwse-resize' },
  s: { left: '50%', top: '100%', cursor: 'ns-resize' },
  sw: { left: '0%', top: '100%', cursor: 'nesw-resize' },
  w: { left: '0%', top: '50%', cursor: 'ew-resize' },
};

const HANDLE_LABEL: Record<ResizeHandle, string> = {
  nw: 'top left',
  n: 'top',
  ne: 'top right',
  e: 'right',
  se: 'bottom right',
  s: 'bottom',
  sw: 'bottom left',
  w: 'left',
};

export interface MoodboardSelectionProps {
  box: Box;
  zoom: number;
  /**
   * Whether the frame offers resize and rotate handles. It does for one
   * unlocked node; a group or a multiple selection can be dragged as a whole
   * but not reshaped, since there is no one node the handles would belong to.
   */
  reshapable: boolean;
  onHandlePointerDown: (
    event: PointerEvent<HTMLButtonElement>,
    handle: ResizeHandle | 'rotate',
  ) => void;
}

/**
 * The frame drawn around what is selected.
 *
 * It lives inside the board's transformed container so it turns with the node
 * it belongs to, but every measurement it draws is divided by the zoom, so the
 * outline stays one pixel and the handles stay grabbable at any zoom.
 */
export function MoodboardSelection({
  box,
  zoom,
  reshapable,
  onHandlePointerDown,
}: MoodboardSelectionProps) {
  const pixel = 1 / zoom;
  const handleSize = HANDLE_SIZE * pixel;

  return (
    <div
      className="pointer-events-none absolute z-50"
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        transform: `rotate(${box.rotation}rad)`,
        outline: `${Math.max(pixel, 0.5)}px solid var(--lz-blue)`,
      }}
    >
      {reshapable && (
        <>
          <button
            type="button"
            aria-label="Rotate"
            className="pointer-events-auto absolute rounded-full border bg-board"
            style={{
              left: '50%',
              top: 0,
              width: handleSize,
              height: handleSize,
              marginLeft: -handleSize / 2,
              marginTop: -(ROTATE_HANDLE_OFFSET * pixel) - handleSize / 2,
              borderWidth: pixel,
              borderColor: 'var(--lz-blue)',
              cursor: 'grab',
            }}
            onPointerDown={(event) => onHandlePointerDown(event, 'rotate')}
          />
          {RESIZE_HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              aria-label={`Resize ${HANDLE_LABEL[handle]}`}
              className="pointer-events-auto absolute rounded-[2px] border bg-board"
              style={{
                left: HANDLE_POSITION[handle].left,
                top: HANDLE_POSITION[handle].top,
                width: handleSize,
                height: handleSize,
                marginLeft: -handleSize / 2,
                marginTop: -handleSize / 2,
                borderWidth: pixel,
                borderColor: 'var(--lz-blue)',
                cursor: HANDLE_POSITION[handle].cursor,
              }}
              onPointerDown={(event) => onHandlePointerDown(event, handle)}
            />
          ))}
        </>
      )}
    </div>
  );
}
