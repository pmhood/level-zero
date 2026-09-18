/** A heading's position, in pixels from the top of the scrollable surface. */
export interface HeadingPosition {
  id: string;
  top: number;
}

/**
 * Which section is "in view" as the writer scrolls: the last heading (in
 * reading order) whose top has scrolled to or past the current scroll
 * position, so a heading stays the active one until the next heading takes
 * its place. The first heading is active from the top of the document, and
 * `null` means the document has no addressable heading yet.
 *
 * `positions` must already be in reading order — the order their headings
 * appear in the document — which is how the outline and the editor surface
 * both produce them.
 */
export function sectionInView(
  positions: readonly HeadingPosition[],
  scrollTop: number,
): string | null {
  const first = positions[0];
  if (!first) return null;

  let current = first.id;
  for (const position of positions) {
    if (position.top > scrollTop) break;
    current = position.id;
  }
  return current;
}
