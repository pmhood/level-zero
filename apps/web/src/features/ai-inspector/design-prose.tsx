import * as React from 'react';

const HEADING_LINE = /^(#{1,3})\s+(.*)$/;
const BULLET_LINE = /^\s*[-*]\s+(.*)$/;
const NUMBERED_LINE = /^\s*\d+\.\s+(.*)$/;
const INLINE_EMPHASIS = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;

/** Bold and italic within one line — the emphasis a drafted answer actually uses. */
function renderInline(text: string): React.ReactNode {
  return text.split(INLINE_EMPHASIS).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (
      (part.startsWith('*') && part.endsWith('*')) ||
      (part.startsWith('_') && part.endsWith('_'))
    ) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

/**
 * `#`/`##`/`###` shifted down to `h4`/`h5`/`h6` — a drafted answer sits
 * inside the panel's own `h3`, so its headings never outrank it.
 */
function Heading({ level, children }: { level: number; children: React.ReactNode }) {
  const className = level === 1 ? 'text-sm font-semibold' : 'text-xs font-semibold';
  if (level === 1) return <h4 className={className}>{children}</h4>;
  if (level === 2) return <h5 className={className}>{children}</h5>;
  return <h6 className={className}>{children}</h6>;
}

/**
 * Turns an AI answer's Markdown-ish text into headings, lists and paragraphs
 * — formatted design prose (#260) rather than one `whitespace-pre-wrap`
 * block. Deliberately narrow: headings, bullet/numbered lists, bold and
 * italic are what a drafted design answer actually uses; this is not a
 * general Markdown renderer and does not go looking for tables, code fences
 * or links.
 */
export function parseDesignProse(text: string): React.ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  // `noUncheckedIndexedAccess` sees every `lines[i]` as possibly `undefined`
  // even though every call site here keeps `i` inside the array's bounds;
  // this reads the same guarantee back as a plain `string`.
  const lineAt = (index: number): string => lines[index] ?? '';

  while (i < lines.length) {
    const line = lineAt(i);
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const heading = HEADING_LINE.exec(line);
    if (heading) {
      blocks.push(
        <Heading key={key++} level={(heading[1] ?? '#').length}>
          {renderInline(heading[2] ?? '')}
        </Heading>,
      );
      i += 1;
      continue;
    }

    const bullet = BULLET_LINE.exec(line);
    if (bullet) {
      const items: string[] = [];
      while (i < lines.length) {
        const match = BULLET_LINE.exec(lineAt(i));
        if (!match) break;
        items.push(match[1] ?? '');
        i += 1;
      }
      blocks.push(
        <ul key={key++} className="list-disc space-y-1 pl-4">
          {items.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const numbered = NUMBERED_LINE.exec(line);
    if (numbered) {
      const items: string[] = [];
      while (i < lines.length) {
        const match = NUMBERED_LINE.exec(lineAt(i));
        if (!match) break;
        items.push(match[1] ?? '');
        i += 1;
      }
      blocks.push(
        <ol key={key++} className="list-decimal space-y-1 pl-4">
          {items.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lineAt(i).trim() !== '' &&
      !HEADING_LINE.test(lineAt(i)) &&
      !BULLET_LINE.test(lineAt(i)) &&
      !NUMBERED_LINE.test(lineAt(i))
    ) {
      paragraphLines.push(lineAt(i));
      i += 1;
    }
    blocks.push(
      <p key={key++}>
        {paragraphLines.map((paragraphLine, index) => (
          <React.Fragment key={index}>
            {index > 0 && <br />}
            {renderInline(paragraphLine)}
          </React.Fragment>
        ))}
      </p>,
    );
  }

  return blocks;
}

/** An AI answer, rendered as prose rather than a flat block of text. */
export function DesignProse({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 text-xs leading-5 text-foreground">
      {parseDesignProse(text)}
    </div>
  );
}
