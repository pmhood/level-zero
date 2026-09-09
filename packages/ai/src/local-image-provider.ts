import { type AiCapability } from './capabilities';
import { BaseAiProvider, type AiRequest, type AiResult } from './provider';

const DEFAULT_SIZE = 1024;
const MAX_SIZE = 4096;
/** Roughly how many characters of prompt fit on one rendered line. */
const CHARS_PER_LINE = 34;
const MAX_LINES = 12;

export interface LocalImageProviderOptions {
  width?: number;
  height?: number;
}

/**
 * `image.generate` for local development: renders the request as an SVG plate.
 *
 * It is the image counterpart of `@level-zero/storage`'s
 * `LocalObjectStorageProvider` — a real implementation of the port that needs
 * no credentials, so the whole path (capability, context, job, asset, lineage)
 * runs on a laptop. A hosted image model is a different registration in the
 * worker's provider registry and nothing else: the bytes it returns are stored
 * exactly the same way.
 */
export class LocalImageProvider extends BaseAiProvider {
  readonly id = 'local-image';
  readonly capabilities: readonly AiCapability[] = ['image.generate'];
  readonly defaultModel = 'local-plate-1';

  constructor(private readonly options: LocalImageProviderOptions = {}) {
    super();
  }

  async execute(request: AiRequest): Promise<AiResult> {
    const width = dimension(request.parameters?.width, this.options.width);
    const height = dimension(request.parameters?.height, this.options.height);
    const subjects = (request.context?.entities ?? []).map((entity) => entity.name);
    const svg = renderPlate({ width, height, prompt: request.prompt, subjects });

    return {
      capability: request.capability,
      providerId: this.id,
      model: this.defaultModel,
      artifacts: [
        {
          kind: 'image',
          filename: 'generated.svg',
          mimeType: 'image/svg+xml',
          content: Buffer.from(svg, 'utf8'),
          width,
          height,
        },
      ],
      data: { subjects },
    };
  }
}

interface PlateInput {
  width: number;
  height: number;
  prompt: string;
  subjects: string[];
}

function renderPlate({ width, height, prompt, subjects }: PlateInput): string {
  const lines = wrap(prompt, CHARS_PER_LINE).slice(0, MAX_LINES);
  const fontSize = Math.max(12, Math.round(height / 28));
  const top = Math.round(height / 2 - (lines.length * fontSize * 1.4) / 2);

  const body = lines
    .map(
      (line, index) =>
        `<text x="50%" y="${top + index * Math.round(fontSize * 1.4)}" text-anchor="middle" ` +
        `font-size="${fontSize}" fill="#E8EDF5">${escapeXml(line)}</text>`,
    )
    .join('');

  const caption = subjects.length
    ? `<text x="50%" y="${height - fontSize}" text-anchor="middle" font-size="${Math.round(
        fontSize * 0.7,
      )}" fill="#42A5FF">${escapeXml(subjects.join(' · '))}</text>`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" font-family="sans-serif">` +
    `<rect width="${width}" height="${height}" fill="#12161D"/>${body}${caption}</svg>`
  );
}

/** Greedy word wrap; a word longer than the line simply overflows it. */
function wrap(text: string, columns: number): string[] {
  const lines: string[] = [];
  let line = '';

  for (const word of text.split(/\s+/).filter((part) => part.length > 0)) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > columns && line) {
      lines.push(line);
      line = word;
      continue;
    }
    line = candidate;
  }

  if (line) lines.push(line);
  return lines;
}

function dimension(requested: unknown, fallback: number | undefined): number {
  const value = typeof requested === 'number' ? requested : (fallback ?? DEFAULT_SIZE);
  return Math.min(Math.max(Math.trunc(value), 1), MAX_SIZE);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
