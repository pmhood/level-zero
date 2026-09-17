/**
 * The GDD workspace's routes (#182): `/gdd` is the index — it opens the most
 * recently updated document, or asks the writer to start one — and
 * `/gdd/:documentId` is one document's own address, the same way
 * `entityRoute` is the canonical entity page's (`entity-detail/entity-route.ts`).
 *
 * The only place either path is built, so a document link never drifts from
 * what the route segments actually are.
 */
export function gddRoute(projectId: string): string {
  return `/projects/${projectId}/gdd`;
}

export function gddDocumentRoute(projectId: string, documentId: string): string {
  return `${gddRoute(projectId)}/${documentId}`;
}
