'use client';

import type { Entity } from '@level-zero/domain';
import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

import { EntityOptionList } from './entity-option-list';
import { insertEntityMention } from './entity-mention';

interface EntityMenuHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const EntityMentionMenu = forwardRef<EntityMenuHandle, SuggestionProps<Entity, Entity>>(
  function EntityMentionMenu({ items, command }, ref) {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [items]);

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (items.length === 0) return false;

          if (event.key === 'ArrowDown') {
            setSelected((index) => (index + 1) % items.length);
            return true;
          }
          if (event.key === 'ArrowUp') {
            setSelected((index) => (index - 1 + items.length) % items.length);
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            const item = items[selected];
            if (item) command(item);
            return true;
          }
          return false;
        },
      }),
      [items, selected, command],
    );

    if (items.length === 0) return null;

    return (
      <div className="w-64 rounded-lg border border-border bg-raised p-1 shadow-[var(--lz-shadow-floating)]">
        <EntityOptionList
          entities={items}
          selectedIndex={selected}
          onHighlight={setSelected}
          onSelect={command}
          label="Mention an entity"
          emptyMessage="Nothing matches."
        />
      </div>
    );
  },
);

/**
 * Typing `@` opens a scoped search over the project's entities and inserts a
 * stable reference to whichever one is picked.
 *
 * `search` is supplied by the workspace rather than read from a store, because
 * the extension is built once for the lifetime of the editor while the entity
 * list keeps arriving — the closure reads the current list each time the menu
 * asks for items.
 */
export function createEntityMentionSuggestion(search: (query: string) => Entity[]): Extension {
  return Extension.create({
    name: 'entityMentionSuggestion',

    addProseMirrorPlugins() {
      return [
        Suggestion<Entity, Entity>({
          editor: this.editor,
          char: '@',
          // Entity names are usually two or three words: "Oxygen Management".
          allowSpaces: true,
          pluginKey: new PluginKey('entityMentionSuggestion'),
          allow: ({ editor }) => !editor.isActive('codeBlock'),
          items: ({ query }) => search(query),
          command: ({ editor, range, props }) => insertEntityMention(editor, range, props),
          render: () => {
            let renderer: ReactRenderer<EntityMenuHandle> | null = null;
            let unmount: (() => void) | undefined;

            return {
              onStart: (props) => {
                renderer = new ReactRenderer(EntityMentionMenu, { props, editor: props.editor });
                unmount = props.mount(renderer.element as HTMLElement);
              },
              onUpdate: (props) => renderer?.updateProps(props),
              onKeyDown: (props) => renderer?.ref?.onKeyDown(props) ?? false,
              onExit: () => {
                unmount?.();
                unmount = undefined;
                renderer?.destroy();
                renderer = null;
              },
            };
          },
        }),
      ];
    },
  });
}
