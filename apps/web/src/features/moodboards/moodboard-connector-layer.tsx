'use client';

import type { MoodboardNode } from '@level-zero/domain';

import { useMoodboardCanvasContext } from './moodboard-canvas-context';

/**
 * The lines drawn between nodes, painted over the canvas in page coordinates.
 *
 * Connectors are not shapes. They have no geometry of their own — a line is
 * two node ids and a label — so drawing them from the nodes' current bounds
 * keeps the stored model as small as what it actually means, and keeps a
 * dragged connector from ever being mistaken for a project relationship.
 */
export function MoodboardConnectorLayer() {
  const { connectors, nodes } = useMoodboardCanvasContext();
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const lines = connectors.flatMap((connector) => {
    const from = byId.get(connector.fromNodeId);
    const to = byId.get(connector.toNodeId);
    if (!from || !to) return [];
    return [{ connector, from: centerOf(from), to: centerOf(to) }];
  });

  if (lines.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute size-px overflow-visible"
      aria-hidden
      style={{ left: 0, top: 0 }}
    >
      {lines.map(({ connector, from, to }) => (
        <g key={connector.id}>
          <line
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={connector.relationshipId ? 'var(--lz-blue)' : 'var(--lz-border-strong)'}
            strokeWidth={2}
            strokeDasharray={connector.relationshipId ? undefined : '6 6'}
          />
          {connector.label && (
            <text
              x={(from.x + to.x) / 2}
              y={(from.y + to.y) / 2 - 6}
              textAnchor="middle"
              fill="var(--lz-text-secondary)"
              fontSize={12}
            >
              {connector.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function centerOf(node: MoodboardNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}
