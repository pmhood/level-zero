/** The distinct tags across a set of ideas, alphabetized for a filter row. */
export function uniqueIdeaTags(ideas: readonly { tags: string[] }[]): string[] {
  return [...new Set(ideas.flatMap((idea) => idea.tags))].sort((a, b) => a.localeCompare(b));
}
