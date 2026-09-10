# Canonical entity routes

**Status:** decided in #86. **This document implements nothing.** #67 builds the route and the
shell, #68 navigates to it, and #66 inherits §9.

Every claim about the codebase below was read out of the tree at `72dc538` on **2026-09-09**. File
paths and line numbers are quoted so a reader can check them rather than trust them.

---

## 1. Why this exists

#67 offers two products in one sentence:

> The route should resolve any supported entity type and render a useful generic detail experience
> **or** redirect/embed into a type-specific workspace when appropriate.

Those are not variants of one design. One says a canonical entity has a page; the other says it has
an address that bounces you somewhere else. Whichever is chosen sets the navigation model for
search results, GDD mentions, activity entries, compare mode, AI references and #68's command
palette — everything that will ever need to say "open that thing".

An implementer picking one unattended would be making that product decision inside a PR. This
document makes it, and gives #67, #68 and the per-type work enough to proceed without reopening it.

---

## 2. What is actually there today

Nine facts, all verified, that constrain the answer more than any preference does.

1. **There is no entity route, and no entity link.** The only dynamic segment in the whole app is
   `[projectId]`. `apps/web/src/app/projects/[projectId]/` has `page.tsx` plus `characters`, `gdd`,
   `idea-lab`, `mechanics`, `moodboards`, `search` and `world`. Every `href` in `apps/web/src` — six
   of them, in `project-sidebar.tsx`, `project-shell.tsx`, `project-overview.tsx` and
   `project-card.tsx` — targets `/`, a project, or one of those eight tool routes.
2. **The API already has the route this document is about.** `apps/api/src/entities/entities.controller.ts:13`
   is `@Controller('projects/:projectId/entities')` with `@Get(':entityId')`. Versions
   (`versions.controller.ts:24`) and relationships (`relationships.controller.ts:22`) hang off
   `projects/:projectId/entities/:entityId/…`. The web client already has
   `getEntity(projectId, entityId)` at `apps/web/src/lib/api.ts:188` — no React Query hook wraps it,
   because nothing has needed one.
3. **Cross-project isolation is already enforced, deliberately, at the service layer.**
   `packages/domain/src/entity/entity-service.ts:71` — `getById` throws `NotFoundError` for an id
   belonging to another project, with the comment "a caller must not be able to probe for the
   existence of another project's entities."
4. **Every workspace keeps selection in local React state.** `useState<string | null>(null)` in
   `characters-workspace.tsx:31`, `world-workspace.tsx:34`, `mechanics-workspace.tsx:35`,
   `gdd-workspace.tsx:102`, `moodboards-workspace.tsx:43`; `idea-lab-workspace.tsx:21` holds the
   whole entity. There are zero `useSearchParams`/`useParams` calls in `apps/web/src`. No workspace
   can currently be told what to select from a URL.
5. **Three type-specific detail surfaces exist, and they are already single-entity components.**
   `CharacterDetail({ projectId, character })`, `WorldDetail({ projectId, entity, onOpenReference })`
   and `MechanicDetail({ projectId, mechanic })` each render their own header, their own `Tabs`, and
   their own scroll container. Character has seven tabs (Overview, Visuals, Background, Inventory,
   Relationships, Notes, Compare); World has three; Mechanic has five.
6. **Search results are dead ends.** `search-result-list.tsx` renders `EntityCard`s with no `href`
   and no `onClick`. You can find a character in search and then have nowhere to click.
7. **The UX spec has already ruled on selection versus opening.** `docs/design/page-by-page-ux-spec.md`,
   "Universal selection": selecting "keeps the user in the current workspace", and "Double-click or
   **Open** navigates to the canonical entity." The canonical entity is, in the spec's own words, a
   navigation destination distinct from the inspector.
8. **`Inspector.onClose` is already optional** (`packages/ui/src/inspector.tsx:9`), and
   `WorkspacePage` (`packages/ui/src/workspace-page.tsx:5`) is entity-agnostic: header, optional
   toolbar, body, optional inspector aside.
9. **Typed routes are on** (`apps/web/next.config.ts`, `typedRoutes: true`). Interpolated hrefs need
   the `as Route` cast the sidebar already uses (`project-sidebar.tsx:36`).

---

## 3. The three models

### 3.1 Model A — redirect into the owning workspace

`/projects/:projectId/entities/:entityId` resolves the entity, reads its type, and redirects to
`/projects/:projectId/characters?selected=:entityId` (or `world`, `mechanics`, `idea-lab`, …).

### 3.2 Model B — one generic page, workspaces untouched

The route renders a single type-agnostic detail page for all 19 types: name, type, status, tags,
description, relationships, version history. A character shows the same page as a hazard.

### 3.3 Model C — a generic shell with type-specific bodies

The route owns identity, project scoping, error states, relationships and history — the *shell* —
and delegates the body to a per-type component where one exists, falling back to a generic body
where one does not. This is what #67's acceptance criterion "type-specific renderers can enhance the
generic shell without forking identity/navigation behavior" describes.

---

## 4. Decision — Model C

**Adopt Model C: a generic shell at `/projects/:projectId/entities/:entityId` that owns identity and
navigation, with a per-type body component looked up from one static map.**

The reasoning, in order of weight:

1. **Model A cannot cover the types, so it needs Model B underneath it anyway.** `scene`,
   `prototype` and `build` have no web workspace at all; `design_pillar` appears only as a read-only
   card list on the project overview; `asset_reference` entities are created by the Characters
   feature but have no browser of their own. A redirect model still has to answer "redirect a
   `build` to where?", and the answer is a generic page. Having built the generic page, Model A is
   Model C with a worse default.
2. **Model A destroys the property it was asked to provide.** The user ends up at
   `/projects/p/characters?selected=e`. Copy that link and you have shared a workspace URL with a
   query parameter, not a canonical entity address — at exactly the moment the feature is being
   used. "One canonical route per entity" and "the address bar never shows it" cannot both hold.
3. **Model A is more work than it looks.** Every workspace holds selection in `useState` (§2.4).
   Redirecting means teaching seven workspaces to read selection from the URL and to keep it in sync
   as the user clicks around. That is a larger, riskier diff than a new route, and it lands in files
   that #43, #44 and #48 have already shaped.
4. **Model B under-serves the types that matter most.** A character has seven tabs of real content
   (§2.5). A canonical route that shows name, tags and a JSON blob is worse than the workspace users
   already have, so they will keep using the workspace and the canonical route will only ever be a
   waypoint. #67's own acceptance criteria name Character, Mechanic and Location explicitly.
5. **Model C is nearly free for the three types that have detail surfaces.** The detail components
   are already `(projectId, entity) => JSX` (§2.5). The shell does not reimplement them; it renders
   them. See §6.
6. **The API already has this exact shape** (§2.2). The web route mirrors the resource tree instead
   of inventing a parallel one, and versions and relationships are already addressed as children of
   the entity — the page's tabs and the endpoints line up one to one.
7. **It is the only model that makes search results clickable without a special case** (§2.6). One
   `href` per hit, whatever the hit is.

### The strongest argument against

**It creates a second front door to the same content, and the two will drift.** After #67 a
character can be read at `/characters` (browser + detail + inspector) and at `/entities/:id` (shell
+ detail). The next person to add a tab adds it to one of them. Within a few issues the workspace
and the canonical page disagree about what a character is, and every bug report needs "which one
were you on?" before it can be triaged.

This is a real cost and it is not fully avoidable. It is contained by one rule, which should be
enforced in review: **the canonical route renders the same component the workspace renders, never a
copy of it.** §6 makes that mechanical rather than aspirational — the map's values are the very
components the workspaces import. If a type's entry in the map ever becomes a bespoke component that
the owning workspace does not also use, that is a review comment.

If the reviewer of #67 finds that rule has been broken in the first implementation, the right
response is to fix the implementation, not to fall back to Model A — Model A's cost (§4.2) is
permanent and Model C's is a discipline.

### The second-strongest

**Two of the 19 types will look wrong on a generic page in a way the fallback cannot fix.** A
`moodboard` is a canvas and a `document` is a GDD; neither is a form. Their canonical pages will
show identity, relationships and history and then say "open this in Moodboards" / "open this in the
GDD" and hand off. That is honest but slightly hollow, and someone will file it as a bug. The
alternative — deep-selecting into those workspaces from the URL — is the Model A work in §4's third
reason, and is explicitly out of scope here (§12).

---

## 5. The character case, concretely

`/projects/:projectId/entities/:entityId` where the entity's type is `character`:

- **Loads** the entity with `getEntity(projectId, entityId)` (`apps/web/src/lib/api.ts:188`) through
  a new React Query hook. The lookup is by type-agnostic id; nothing about the URL says "character".
- **Renders** `WorkspacePage` with `title={entity.name}`, `description={entityTypeLabel(entity.type)}`,
  actions carrying the status badge plus Archive/Restore and an "Open in Characters" link, the
  existing `CharacterInspector` as the `inspector`, and — as the body — **the same tabbed surface
  `CharacterDetail` renders inside the Characters workspace** (§6 says how).
- **Does not duplicate the workspace.** No character browser, no composer, no "New character". The
  browser is the Characters workspace's reason to exist and the canonical page is not a second one.
- **Does not redirect.** The URL the user opened is the URL they stay on.
- **Does not change the Characters workspace.** `CharactersWorkspace` keeps its local `selectedId`,
  its browser and its inspector exactly as they are. What it gains is an **Open** affordance on the
  selected character that links to the canonical route — the UX spec's Universal selection rule
  (§2.7), which the workspace does not currently honour because there was nowhere to go.

**The general rule this yields:** the canonical route is the type-agnostic *page*, and a workspace's
detail surface is the type-specific *body* that page shows. Embed, do not duplicate; do not bounce.

---

## 6. The renderer seam

**Mechanism: one static lookup table, in the route's own feature directory.**

```
apps/web/src/features/entity-detail/
  entity-detail-page.tsx        the shell: load, error states, header, inspector, body slot
  entity-detail-renderers.tsx   the map
  entity-detail-fallback.tsx    the generic body
```

```tsx
/** A type-specific body for the canonical entity page. Given the resolved entity, render its content. */
export type EntityDetailBody = (props: {
  projectId: string;
  entity: Entity;
  /** Where a reference inside the body leads — the shell's navigation, never the body's own. */
  onOpen: (referenced: Entity) => void;
}) => ReactNode;

export const ENTITY_DETAIL_BODIES: Partial<Record<EntityType, EntityDetailBody>> = {
  character: ({ projectId, entity }) => <CharacterDetailBody projectId={projectId} character={entity} />,
  mechanic: ({ projectId, entity }) => <MechanicDetailBody projectId={projectId} mechanic={entity} />,
  system: ({ projectId, entity }) => <MechanicDetailBody projectId={projectId} mechanic={entity} />,
  location: ({ projectId, entity, onOpen }) => (
    <WorldDetailBody projectId={projectId} entity={entity} onOpenReference={onOpen} />
  ),
  // … region, faction, culture, technology, event, hazard, lore, the same way
};
```

The shell does `ENTITY_DETAIL_BODIES[entity.type] ?? EntityDetailFallback`. That is the whole
mechanism: eleven entries, one arrow function each, no registration step.

The entries are one-line adapters because the three components name their entity prop differently
(`character`, `mechanic`, `entity`) — renaming them all to `entity` is churn in three feature
directories for no gain, and the adapter is where a signature difference belongs. `WorldDetail`'s
existing `onOpenReference` shows why `onOpen` is on the contract rather than left to each body: the
body says *that* a reference is followed, the shell decides *where* it goes.

**Why a plain map and not a registry.** The requirement is "a feature registers a renderer without
the route importing every feature". A static map satisfies it: the route file imports the map, and
the map is the single place that knows which features exist. Side-effect registration — a
`registerRenderer()` call executed at import time by each feature — buys nothing here (there are no
dynamically loaded features, no plugins, no third-party contributors) and costs a startup-order
problem plus a lookup that TypeScript cannot check. A `Partial<Record<EntityType, …>>` is also
already the idiom in this area: `ENTITY_TYPE_LABELS` in
`apps/web/src/features/entities/entity-presentation.ts:8` is the same shape.

**Why a new directory rather than `features/entities/`.** `features/entities/` is imported *by*
characters, world, mechanics, gdd and search. Putting the map there would make it import them back
and turn a clean one-way edge into a cycle. `features/entity-detail/` is imported by the route and
by nothing else.

**How the body components come to exist.** `CharacterDetail`, `WorldDetail` and `MechanicDetail`
each render `<header>` (name, type label, a type-specific subtitle, type-specific badges) followed
by `Tabs` and the panels. #67 splits each one at that seam:

- `CharacterDetailBody({ projectId, character })` — the tabs and panels, no header.
- `CharacterDetail` — the existing header plus `CharacterDetailBody`. Unchanged from its
  workspace's point of view.

No boolean `showHeader` prop, no shared header with a slot per type. Two components, one of which is
the other's caller. The workspace keeps its exact current appearance; the canonical page shows the
same body under the shell's header. The cost is that the type-specific header trimmings — Mechanic's
`· Combat` area, World's `· Third Age` era and canon badge — do not appear in the canonical page's
header. They are visible in the body's own fields, and that is an acceptable difference.

**Why a body cannot change identity or navigation semantics.** It is handed an already-resolved
`Entity` and returns a `ReactNode`. It never sees the route params, so it cannot decide what the
page is about; the shell has already resolved the project, the id, the 404 and the archived state
before the body is called. It renders no name, no status badge and no breadcrumb, because those
moved to the shell. This is a contract carried by a deliberately narrow prop type plus review, not
by the compiler — which is proportionate to the three implementations that exist.

---

## 7. All nineteen types

Every `ENTITY_TYPES` member (`packages/domain/src/entity/entity-type.ts`) resolves at the canonical
route. The body is what differs.

| Type | Body on day one | Owning workspace, for the "Open in…" link |
| --- | --- | --- |
| `character` | `CharacterDetailBody` | Characters |
| `mechanic`, `system` | `MechanicDetailBody` | Mechanics |
| `region`, `location`, `faction`, `culture`, `technology`, `event`, `hazard`, `lore` | `WorldDetailBody` | World |
| `idea` | fallback | Idea Lab |
| `moodboard` | fallback | Moodboards |
| `document` | fallback | GDD |
| `design_pillar` | fallback | Project overview |
| `asset_reference` | fallback | — (no browser exists) |
| `scene`, `prototype`, `build` | fallback | — (no workspace exists) |

Eleven types get a bespoke body; eight take the fallback. **The fallback is a defined behaviour, not
a gap** — `idea` is in #67's acceptance criteria and is served by it.

**What the fallback renders:** description; tags; any rich-text field in `data` read through
`entityDocument` (`apps/web/src/features/entities/entity-document.ts`) and shown read-only; the
remaining scalar `data` fields as a labelled list; and, where the type has an owning workspace, a
link to it. Relationships and version history are not the fallback's job — they are the shell's, for
every type (§8).

A type gains a bespoke body when its feature grows a detail surface worth showing, by adding one
line to the map. Nothing else changes.

---

## 8. Identity, rename, archived, missing, cross-project

**Ids are the address; there is no second identity concept.** `Entity` has `id`, `projectId`, `type`
and `name` and no slug (`packages/domain/src/entity/entity.ts:26`). The route segment is
`Entity.id`. Renaming an entity is a `PATCH` of `name` and changes no URL — the URL cannot go stale
because it never contained the name. This is the same guarantee GDD mentions already rely on:
`entity-reference.ts:34` stores the id and resolves the name at render time, precisely so "renaming
the entity changes what the document *shows* without rewriting its JSON". Do not add a slug, a
human-readable alias, or a `/entities/character/:id` type segment; the type is a property of the
entity, not of its address, and putting it in the URL creates a second address that can disagree
with the first.

**Archived** renders the full page, read-only, with the archived state stated and a Restore action.
`Entity.status === 'archived'` already drives read-only behaviour inside the existing bodies —
`character-detail.tsx:50`, `world-detail.tsx:69`, `mechanic-detail.tsx:77` all compute `archived` and
disable their forms, and `world-lore.tsx:62` refuses to open the editor — so the body needs no new
work. The shell adds the archived status badge and the Restore button (the same mutation
`CharacterInspector` already calls). It must not 404 and must not redirect: an archived character is
the reason a durable link exists.

**Missing** — the query fails with `ApiRequestError` and `status === 404` — renders an in-shell
`EmptyState`, not Next's `notFound()`. The page is a client component fetching through React Query,
like every other surface in this app, so the 404 arrives as a query error. The precedent to copy
exactly is `project-shell.tsx:29-49`: branch on `error instanceof ApiRequestError && error.status === 404`,
show an `EmptyState` with a way back, and use `apiErrorMessage(error)` for anything else.

**Cross-project** is not a distinct case, and that is the point. `EntityService.getById` already
returns `NotFoundError` for another project's id (§2.3), so the route shows **the identical**
not-found state with the identical copy. No "this belongs to another project" message, no redirect
to the right project — either would confirm the entity exists. `ProjectShell`'s existing wording
sets the tone: "This project doesn't exist, or you don't have access to it."

---

## 9. The canonical route and the inspector

**The inspector stays the primary in-workspace reading surface. The canonical route is a deep-link
destination and the target of "Open". Neither supersedes the other.**

This is not a new judgment; `docs/design/page-by-page-ux-spec.md` already made it (§2.7). Selecting
updates the inspector and keeps you where you are; **Open** navigates to the canonical entity. Every
workspace today implements the first half and none implements the second, because there was nowhere
to navigate to. #67 supplies the destination.

Concretely:

- Clicking an entity card in a browser still selects it and fills the inspector. It does not
  navigate.
- Clicking a GDD mention still opens `EntityReferenceInspector` beside the document. Its own comment
  gives the reason — "beside the document rather than in place of it, so the sentence that mentioned
  it stays on screen" (`entity-reference-inspector.tsx:9`) — and that reason survives this decision
  intact. Navigating away from a document mid-sentence because the writer clicked a chip would be a
  regression.
- The **Open** button in the mention's hover preview (`entity-mention.tsx:173`) becomes a link to the
  canonical route. So does an Open added to `EntityReferenceInspector`, and to the workspace
  inspectors. This is the one behaviour change #67 makes to existing surfaces, and it is additive.
- The canonical page itself has an inspector: the type's existing inspector component
  (`CharacterInspector`, `WorldInspector`, `MechanicInspector`) with no `onClose` — there is no
  selection to clear. `Inspector.onClose` is already optional (§2.8), so this needs `onClose?:` on
  the three feature inspectors and nothing more. Types with no inspector show none.

**For #66:** the contextual AI inspector's context is derived from selection *and workspace*, and
the canonical route is a workspace like any other whose selection is fixed to one entity. #66 does
not need a special case for it; it needs to treat "the route's entity" as the selection.

---

## 10. What #67 changes outside the new route

Listed so the scope is not a surprise:

- A `useEntity(projectId, entityId)` hook wrapping the existing `api.getEntity`.
- `CharacterDetail`, `WorldDetail`, `MechanicDetail` split into header + `…Body` (§6).
- `onClose` made optional on `CharacterInspector`, `WorldInspector`, `MechanicInspector`.
- `EntityReferenceContextValue` gains `projectId` so a mention can build its own href; the preview's
  **Open** button becomes a `Link`.
- `SearchResultList` wraps each `EntityCard` in a link to the canonical route — the fix for §2.6.
- An `entityRoute(projectId, entityId)` helper in `features/entity-detail/`, so the path string
  exists once. Interpolated hrefs need `as Route` (§2.9).

Everything else — the workspaces, their selection state, their browsers, their composers — is
untouched.

---

## 11. Does the UX spec need amending?

**Yes, one addition — and it is not this issue's to make.**

`docs/design/page-by-page-ux-spec.md` is not wrong. Its "Universal selection" section already says
Open navigates to the canonical entity, and its "Universal context menu" already lists **Open** as an
action. What it lacks is a section describing the destination: the canonical entity page has no
entry in a spec that is organised page by page and has one for every other screen.

The amendment to make, **with #67 and not before**, is a short "Canonical entity page" section
after "GDD", stating: the address is `/projects/:projectId/entities/:entityId`; the page is
identity + relationships + history with a type-specific body; the inspector is the in-workspace
surface and this page is where Open goes; archived renders read-only; missing and cross-project ids
render the same not-found state.

`docs/design/frontend-design-system-and-implementation-spec.md` needs nothing. §21 (Inspector Panel),
§25 (Entity Model), §27 (Context Menu) and §36 (Entity Embeds — whose hover mock already ends in an
`[Open]` button) are all consistent with this decision.

Do not edit either file in #86.

---

## 12. Follow-up — deliberately not decided here

- **Deep selection inside a workspace from a URL** (`/characters?selected=…`). It would let the
  canonical page's "Open in Characters" land on the right character, and it is what a `moodboard` or
  `document` canonical page would need to hand off properly (§4, second argument against). It is
  Model A's cost and Model C does not need it, so it should be its own issue with its own
  justification.
- **Bespoke bodies for `idea`, `document`, `moodboard`, `prototype` and `build`.** One line in the
  map each, once those features have a detail surface worth showing. `prototype`, `scene` and
  `build` have no web feature at all yet.
- **Code-splitting the map.** It pulls three feature bodies into the route's bundle. If that becomes
  measurable, the map's values can become `next/dynamic` imports without changing the seam. Not
  worth doing pre-emptively.
- **#68's palette.** This document fixes only the navigation target: the palette's "Go to…" results
  push `/projects/:projectId/entities/:entityId`. Its command registration model is its own issue
  and should not be assumed to look like §6's map.
- **Amending the UX spec** (§11), which belongs with #67.
