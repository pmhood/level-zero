import { documentBlocks, type DocumentBlock, type DocumentContent } from '../document/document';
import { describeValue, fieldLabel, type Difference } from './difference';

/** How the common block types read in a list of differences. */
const BLOCK_LABELS: Record<string, string> = {
  paragraph: 'Paragraph',
  heading: 'Heading',
  bulletList: 'Bulleted list',
  orderedList: 'Numbered list',
  taskList: 'Checklist',
  blockquote: 'Quote',
  codeBlock: 'Code',
  horizontalRule: 'Divider',
  table: 'Table',
  image: 'Image',
};

/**
 * What was written, cut or rewritten between two versions of a document.
 *
 * Compared block by block on the prose each one shows, never on the stored
 * JSON: two bodies that read identically differ in their serialized form the
 * moment the editor touches an attribute, and a writer asked to read that
 * would learn nothing. Blocks that survived unchanged are matched by their
 * text, so inserting a paragraph reports one addition rather than moving
 * everything after it.
 */
export function documentDifferences(from: DocumentContent, to: DocumentContent): Difference[] {
  return blockDifferences(documentBlocks(from), documentBlocks(to));
}

function blockDifferences(from: DocumentBlock[], to: DocumentBlock[]): Difference[] {
  const kept = keptBlockCount(from, to);
  const differences: Difference[] = [];

  let removed: DocumentBlock[] = [];
  let added: DocumentBlock[] = [];

  /**
   * A removal followed straight away by an addition is one block being
   * rewritten, which is what a writer means by "this changed" — so the runs
   * either side of a kept block are paired up rather than listed twice.
   */
  const flush = (): void => {
    for (let index = 0; index < Math.max(removed.length, added.length); index += 1) {
      const before = removed[index] ?? null;
      const after = added[index] ?? null;
      const block = after ?? before;
      if (!block) continue;

      differences.push({
        key: String(differences.length),
        label: blockLabel(block.type),
        change: before === null ? 'added' : after === null ? 'removed' : 'changed',
        from: before ? describeValue(before.text) : null,
        to: after ? describeValue(after.text) : null,
      });
    }
    removed = [];
    added = [];
  };

  let i = 0;
  let j = 0;
  while (i < from.length || j < to.length) {
    const before = from[i];
    const after = to[j];

    if (before && after && before.text === after.text) {
      flush();
      i += 1;
      j += 1;
    } else if (after && (!before || kept(i, j + 1) >= kept(i + 1, j))) {
      added.push(after);
      j += 1;
    } else if (before) {
      removed.push(before);
      i += 1;
    } else {
      break;
    }
  }
  flush();

  return differences;
}

/**
 * `kept(i, j)`: how many blocks of `from` from `i` on still appear, in order,
 * in `to` from `j` on — the longest common subsequence, held as one flat table
 * so the walk above can ask which side to move.
 */
function keptBlockCount(
  from: DocumentBlock[],
  to: DocumentBlock[],
): (i: number, j: number) => number {
  const width = to.length + 1;
  const table = new Array<number>((from.length + 1) * width).fill(0);
  const kept = (i: number, j: number): number => table[i * width + j] ?? 0;

  for (let i = from.length - 1; i >= 0; i -= 1) {
    for (let j = to.length - 1; j >= 0; j -= 1) {
      const before = from[i];
      const after = to[j];
      table[i * width + j] =
        before && after && before.text === after.text
          ? kept(i + 1, j + 1) + 1
          : Math.max(kept(i + 1, j), kept(i, j + 1));
    }
  }
  return kept;
}

function blockLabel(type: string): string {
  return BLOCK_LABELS[type] ?? fieldLabel(type);
}
