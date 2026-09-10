'use client';

import type {
  Asset,
  Entity,
  MoodboardConnector,
  MoodboardNode,
  RelationType,
} from '@level-zero/domain';
import { Button, Field, Input, Inspector, Select, Textarea } from '@level-zero/ui';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { MOODBOARD_NODE_LABEL } from './moodboard';

/**
 * How long the writer pauses before an edit goes out.
 *
 * Shorter than the GDD editor's, because these are one-line fields whose result
 * is drawn on the board a moment later rather than paragraphs of prose.
 */
const CONTENT_SAVE_DELAY_MS = 600;

/**
 * The relations a board connector can stand for.
 *
 * Lineage relations are left out: they record how something came to exist and
 * are written by promotion and generation, never picked from a menu on a board.
 */
const MOODBOARD_PROMOTION_RELATIONS = [
  'references',
  'appears_in',
  'belongs_to',
  'contains',
] as const satisfies readonly RelationType[];

export interface MoodboardInspectorProps {
  node: MoodboardNode | null;
  entities: ReadonlyMap<string, Entity>;
  assets: ReadonlyMap<string, Asset>;
  connectors: readonly MoodboardConnector[];
  nodes: readonly MoodboardNode[];
  onEditContent: (nodeId: string, data: Record<string, unknown>) => void;
  onPromoteConnector: (connectorId: string, relation: RelationType) => void;
  onDisconnect: (connectorId: string) => void;
  /**
   * The shared visual generation surface, composed by the workspace.
   *
   * A slot rather than a panel built here, so this component stays
   * presentational and there is still only one generator in the product.
   */
  generator?: ReactNode;
}

/**
 * The board's contextual panel: what can be done with what is selected.
 *
 * Node content is edited here rather than on the canvas, so the canvas stays
 * about arranging. The connector list is here too, because promoting a line
 * into a project relationship is a deliberate act and belongs beside the words
 * that say what it would mean — never a side effect of drawing it.
 */
export function MoodboardInspector({
  node,
  entities,
  assets,
  connectors,
  nodes,
  onEditContent,
  onPromoteConnector,
  onDisconnect,
  generator,
}: MoodboardInspectorProps) {
  return (
    <Inspector
      title={node ? MOODBOARD_NODE_LABEL[node.type] : 'Board'}
      description={node ? 'Selected node' : 'Nothing selected'}
    >
      <div className="flex flex-col gap-5">
        {node ? (
          <NodeDetails node={node} entities={entities} assets={assets} onEdit={onEditContent} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Select something on the board to see what you can do with it.
          </p>
        )}

        {generator}

        <ConnectorList
          connectors={connectors}
          nodes={nodes}
          entities={entities}
          onPromote={onPromoteConnector}
          onDisconnect={onDisconnect}
        />
      </div>
    </Inspector>
  );
}

function NodeDetails({
  node,
  entities,
  assets,
  onEdit,
}: {
  node: MoodboardNode;
  entities: ReadonlyMap<string, Entity>;
  assets: ReadonlyMap<string, Asset>;
  onEdit: (nodeId: string, data: Record<string, unknown>) => void;
}) {
  const referenced = node.entityId ? entities.get(node.entityId) : undefined;
  const asset = node.assetId ? assets.get(node.assetId) : undefined;

  return (
    <section className="flex flex-col gap-4">
      {referenced && (
        <Field label="Shows entity">
          <p className="text-sm text-foreground">{referenced.name}</p>
          <p className="text-xs text-faint-foreground">
            Removing this node leaves the entity exactly where it is.
          </p>
        </Field>
      )}
      {asset && (
        <Field label="Shows asset">
          <p className="text-sm text-foreground">{asset.filename}</p>
          <p className="text-xs text-faint-foreground">
            The same file can sit on any number of boards.
          </p>
        </Field>
      )}

      {/* Keyed, so selecting another node builds a new form from that node's
          content instead of carrying the last one's draft — and unmounting the
          old form is what sends whatever it was still holding, to the node it
          was actually typed into. */}
      <NodeContentForm key={node.id} node={node} onEdit={onEdit} />

      <Field label="Placement">
        <p className="text-xs text-muted-foreground">
          {Math.round(node.x)}, {Math.round(node.y)} · {Math.round(node.width)}×
          {Math.round(node.height)} · {Math.round((node.rotation * 180) / Math.PI)}°
          {node.locked ? ' · locked' : ''}
        </p>
      </Field>
    </section>
  );
}

function NodeContentForm({
  node,
  onEdit,
}: {
  node: MoodboardNode;
  onEdit: (nodeId: string, data: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState<ContentDraft>(() => ({
    text: typeof node.data.text === 'string' ? node.data.text : '',
    url: typeof node.data.url === 'string' ? node.data.url : '',
    colors: Array.isArray(node.data.colors) ? node.data.colors.join(', ') : '',
  }));
  const schedule = useDebouncedEdit((data) => onEdit(node.id, data));

  function save(next: ContentDraft) {
    setDraft(next);
    schedule(editedData(node.type, next));
  }

  if (node.type === 'text' || node.type === 'note') {
    return (
      <Field label="Text" htmlFor="moodboard-node-text">
        <Textarea
          id="moodboard-node-text"
          value={draft.text}
          onChange={(event) => save({ ...draft, text: event.target.value })}
        />
      </Field>
    );
  }

  if (node.type === 'link') {
    return (
      <>
        <Field label="Title" htmlFor="moodboard-node-title">
          <Input
            id="moodboard-node-title"
            value={draft.text}
            onChange={(event) => save({ ...draft, text: event.target.value })}
          />
        </Field>
        <Field label="URL" htmlFor="moodboard-node-url">
          <Input
            id="moodboard-node-url"
            value={draft.url}
            onChange={(event) => save({ ...draft, url: event.target.value })}
          />
        </Field>
      </>
    );
  }

  if (node.type === 'palette') {
    return (
      <Field
        label="Colours"
        htmlFor="moodboard-node-colors"
        hint="Comma-separated, e.g. #0d1923, #42a5ff"
      >
        <Input
          id="moodboard-node-colors"
          value={draft.colors}
          onChange={(event) => save({ ...draft, colors: event.target.value })}
        />
      </Field>
    );
  }

  return null;
}

interface ContentDraft {
  text: string;
  url: string;
  colors: string;
}

/** The `data` an edit to this kind of node means, and nothing it does not. */
function editedData(type: MoodboardNode['type'], draft: ContentDraft): Record<string, unknown> {
  if (type === 'palette') return { colors: splitColors(draft.colors) };
  if (type === 'link') return { url: draft.url, text: draft.text };
  return { text: draft.text };
}

/**
 * Sends an edit once the writer pauses, rather than once per keystroke.
 *
 * The same shape as the GDD editor's autosave (`useEditorAutosave`): the field
 * stays local so typing is never interrupted, one request goes out per pause,
 * and whatever is still waiting is sent when the form goes away. Without it a
 * sticky note is a `PATCH` per character, each one replacing the node's whole
 * `data`.
 */
function useDebouncedEdit(
  send: (data: Record<string, unknown>) => void,
): (data: Record<string, unknown>) => void {
  const sendRef = useRef(send);
  sendRef.current = send;
  const pendingRef = useRef<Record<string, unknown> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;

    const data = pendingRef.current;
    pendingRef.current = null;
    if (data) sendRef.current(data);
  }, []);

  // Unmounting mid-pause must not silently drop the last edit.
  useEffect(() => flush, [flush]);

  return useCallback(
    (data: Record<string, unknown>) => {
      pendingRef.current = data;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, CONTENT_SAVE_DELAY_MS);
    },
    [flush],
  );
}

function ConnectorList({
  connectors,
  nodes,
  entities,
  onPromote,
  onDisconnect,
}: {
  connectors: readonly MoodboardConnector[];
  nodes: readonly MoodboardNode[];
  entities: ReadonlyMap<string, Entity>;
  onPromote: (connectorId: string, relation: RelationType) => void;
  onDisconnect: (connectorId: string) => void;
}) {
  const byId = new Map(nodes.map((node) => [node.id, node]));

  function nameOf(nodeId: string): string {
    const node = byId.get(nodeId);
    const entity = node?.entityId ? entities.get(node.entityId) : undefined;
    return entity?.name ?? (node ? MOODBOARD_NODE_LABEL[node.type] : 'Removed node');
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium text-muted-foreground">Connections</h3>
      {connectors.length === 0 ? (
        <p className="text-xs text-faint-foreground">
          Select two nodes and choose Connect to draw a line. A line stays on this board until you
          promote it.
        </p>
      ) : (
        connectors.map((connector) => (
          <ConnectorRow
            key={connector.id}
            connector={connector}
            from={nameOf(connector.fromNodeId)}
            to={nameOf(connector.toNodeId)}
            canPromote={
              isEntityNode(byId.get(connector.fromNodeId)) &&
              isEntityNode(byId.get(connector.toNodeId))
            }
            onPromote={onPromote}
            onDisconnect={onDisconnect}
          />
        ))
      )}
    </section>
  );
}

function ConnectorRow({
  connector,
  from,
  to,
  canPromote,
  onPromote,
  onDisconnect,
}: {
  connector: MoodboardConnector;
  from: string;
  to: string;
  canPromote: boolean;
  onPromote: (connectorId: string, relation: RelationType) => void;
  onDisconnect: (connectorId: string) => void;
}) {
  const [relation, setRelation] = useState<RelationType>(MOODBOARD_PROMOTION_RELATIONS[0]);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-raised p-3">
      <p className="text-xs text-foreground">
        {from} → {to}
      </p>
      {connector.relationshipId ? (
        <p className="text-xs text-primary">Promoted to a project relationship.</p>
      ) : canPromote ? (
        <div className="flex items-center gap-2">
          <Select
            aria-label={`Relation for ${from} to ${to}`}
            value={relation}
            onChange={(event) => setRelation(event.target.value as RelationType)}
          >
            {MOODBOARD_PROMOTION_RELATIONS.map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={() => onPromote(connector.id, relation)}>
            Promote
          </Button>
        </div>
      ) : (
        <p className="text-xs text-faint-foreground">
          Only lines between two entity references can become relationships.
        </p>
      )}
      <Button variant="ghost" size="sm" onClick={() => onDisconnect(connector.id)}>
        Erase line
      </Button>
    </div>
  );
}

function isEntityNode(node: MoodboardNode | undefined): boolean {
  return Boolean(node?.entityId);
}

function splitColors(value: string): string[] {
  return value
    .split(',')
    .map((color) => color.trim())
    .filter((color) => color.length > 0);
}
