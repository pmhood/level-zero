import type { Asset, Entity } from '@level-zero/domain';

/**
 * What the contextual AI inspector is currently about.
 *
 * Three cases rather than one per workspace: every tool selects a canonical
 * entity, a file, or nothing at all. The *type* of a selected entity is what
 * decides which actions are offered (see `inspector-actions.ts`), so a
 * character and a mechanic are the same case here and different cases there —
 * which is what keeps this one surface from growing a branch per tool.
 */
export type AiSubject =
  | {
      kind: 'entity';
      entity: Entity;
      /**
       * Workspace material the relationship graph does not hold — a
       * prototype's version history, say. Quoted into the prompt verbatim.
       */
      excerpt?: string | null;
    }
  | { kind: 'asset'; asset: Asset }
  | { kind: 'project' };

/**
 * The subject's identity.
 *
 * Used as a React `key`, so selecting something else builds a fresh panel
 * rather than carrying the last subject's answer, draft or error into it.
 */
export function subjectKey(subject: AiSubject): string {
  switch (subject.kind) {
    case 'entity':
      return `entity:${subject.entity.id}`;
    case 'asset':
      return `asset:${subject.asset.id}`;
    case 'project':
      return 'project';
  }
}

/** What the panel says it is about, in the user's own words for the thing. */
export function subjectLabel(subject: AiSubject): string {
  switch (subject.kind) {
    case 'entity':
      return subject.entity.name;
    case 'asset':
      return subject.asset.filename;
    case 'project':
      return 'this project';
  }
}

/** Where the request points the API's `ContextResolver`. */
export function subjectContext(subject: AiSubject): {
  selectedEntityIds?: string[];
  assetIds?: string[];
  excerpt?: string;
} {
  switch (subject.kind) {
    case 'entity':
      return {
        selectedEntityIds: [subject.entity.id],
        ...(subject.excerpt ? { excerpt: subject.excerpt } : {}),
      };
    case 'asset':
      return { assetIds: [subject.asset.id] };
    case 'project':
      return {};
  }
}

/** The name an accepted recommendation is filed under, before the user edits it. */
export function acceptedIdeaName(subject: AiSubject, actionLabel: string): string {
  return subject.kind === 'project'
    ? actionLabel
    : `${actionLabel}: ${subjectLabel(subject)}`.slice(0, 200);
}
