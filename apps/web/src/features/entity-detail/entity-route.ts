/**
 * The canonical entity route (docs/decisions/canonical-entity-routes.md §4, §8):
 * one address per entity, keyed by id rather than name, that never changes
 * when the entity is renamed.
 *
 * The only place this path is built — everything that links to an entity
 * (relationships, search results, references, "Open in…") goes through this
 * rather than interpolating the segments itself.
 */
export function entityRoute(projectId: string, entityId: string): string {
  return `/projects/${projectId}/entities/${entityId}`;
}
