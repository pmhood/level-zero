# Level Zero

Workbench — a connected game-development workspace, built as a **modular monolith**.

Implemented so far, against the architecture epic
([#1](https://github.com/pmhood/level-zero/issues/1)):

- [#13](https://github.com/pmhood/level-zero/issues/13) — the monorepo, API, worker,
  shared packages and local development environment.
- [#2](https://github.com/pmhood/level-zero/issues/2) — the canonical `Project` and
  `Entity` domain model that every Workbench tool reads and writes.
- [#3](https://github.com/pmhood/level-zero/issues/3) — entity relationships and
  creative lineage, including idea promotion and generation provenance.
- [#4](https://github.com/pmhood/level-zero/issues/4) — entity versioning and
  creative branching: commit, compare, restore, branch and promote.
- [#5](https://github.com/pmhood/level-zero/issues/5) — the `Asset` model and an
  object-storage abstraction, so images, video, audio, 3D files, references,
  exports and build artifacts are one reusable layer instead of a table per tool.
- [#6](https://github.com/pmhood/level-zero/issues/6) — AI generation records and
  provenance, so every generated output can say which provider, model, prompt,
  parameters, inputs and project context produced it.
- [#7](https://github.com/pmhood/level-zero/issues/7) — background jobs, so
  generation and other long-running work runs in the worker process with
  explicit progress, retries and cancellation instead of a held-open request.
- [#8](https://github.com/pmhood/level-zero/issues/8) — AI orchestration and
  project-context resolution, so a feature asks for a capability and gets a
  provider, and a prompt arrives carrying the project material behind it.
- [#12](https://github.com/pmhood/level-zero/issues/12) — prototypes pinned to
  exact entity versions, so a playable experiment keeps resolving to what was
  actually in it, and two prototype versions can be compared.
- [#14](https://github.com/pmhood/level-zero/issues/14) — document persistence,
  autosave and meaningful document versions, so a GDD can be written
  continuously without every pause becoming a permanent revision.
- [#41](https://github.com/pmhood/level-zero/issues/41) — project-wide search
  and semantic retrieval, so entities, documents, assets and generations are
  findable from one place, by the words in them or by what they mean.
- [#47](https://github.com/pmhood/level-zero/issues/47) — asset generation,
  editing and variation as one reusable surface, embedded in Character Studio and
  Moodboards rather than reinvented per workspace, with results arriving
  asynchronously as ordinary reusable `Asset`s.

## Requirements

- **Node.js 22.12+**
- **pnpm 10+** (`corepack enable` picks up the version pinned in `package.json`)
- **Docker** (for local Postgres and Redis)

## Quick start

```bash
git clone https://github.com/pmhood/level-zero.git
cd level-zero

cp .env.example .env     # defaults match infra/docker-compose.yml
pnpm install
pnpm infra:up            # Postgres + Redis
pnpm db:migrate          # create the schema
pnpm dev                 # web, api and worker together
```

| Surface       | URL                                    |
| ------------- | -------------------------------------- |
| Web           | http://localhost:3000                  |
| API           | http://localhost:3001/api              |
| API readiness | http://localhost:3001/api/health/ready |
| Worker health | http://localhost:3002/health           |

The home page shows live readiness for the API and its dependencies, so a working
setup is visible immediately.

## Commands

| Command            | What it does                                                    |
| ------------------ | --------------------------------------------------------------- |
| `pnpm dev`         | Runs web, API and worker in watch mode                          |
| `pnpm build`       | Builds every package and app in dependency order                |
| `pnpm typecheck`   | `tsc --noEmit` across the workspace                             |
| `pnpm lint`        | ESLint over the whole repository                                |
| `pnpm format`      | Prettier write (`pnpm format:check` in CI)                      |
| `pnpm test`        | Vitest in every package and app                                 |
| `pnpm db:generate` | Diffs `packages/database/src/schema` and writes a SQL migration |
| `pnpm db:migrate`  | Applies pending migrations (safe to re-run, safe from empty)    |
| `pnpm db:studio`   | Drizzle Studio                                                  |
| `pnpm infra:up`    | Starts Postgres + Redis                                         |
| `pnpm infra:down`  | Stops them, keeping data                                        |
| `pnpm infra:reset` | Stops them and deletes the volumes                              |

Deployment images are built and pushed by `scripts/publish-images.sh` — see
[Deployment](#deployment).

For tasks with `dependsOn` rules (like `test` and `typecheck`), scope to one workspace with
`pnpm turbo run <task> --filter=@level-zero/api`. Direct `pnpm --filter` bypasses Turbo's build
prerequisites. See the Commands section in `CLAUDE.md` for detailed guidance.

Most tests are pure unit tests, but the repository adapters are covered by
integration tests against real Postgres, so `pnpm test` expects `pnpm infra:up`
to have run first. CI does the same against service containers.

`pnpm db:migrate` prepares the **development** database (`DATABASE_URL`) —
integration tests never touch it. Every checkout's `@level-zero/database`
suite instead connects to its own `level_zero_test_<hash>` database, named
after where the checkout lives on disk, and creates and migrates it on first
use. That is what lets concurrent `pnpm test` runs from different git
worktrees share the one Postgres and Redis `pnpm infra:up` starts (see below)
without truncating each other's fixtures or stealing each other's BullMQ
deliveries — each worktree gets its own database and its own
`level-zero-test-<hash>` queue prefix, derived the same way.

The `infra:*` scripts always read the **main checkout's root `.env`** (gitignored, from
`.env.example`), never one in the current working directory. They resolve it via
`git rev-parse --git-common-dir`, which points at the main checkout's `.git` from any git
worktree, so every worktree attaches to the same `level-zero` Compose stack and its named
volumes instead of starting a rival one on the compose defaults. A fresh clone with no `.env`
still works — Compose falls back to the defaults baked into `infra/docker-compose.yml`.

## Layout

```text
apps/
  web/        Next.js + React (App Router, Tailwind, TanStack Query, Zustand)
  api/        NestJS modular monolith
  worker/     Independently executable background process: runs queued jobs

packages/
  domain/     Framework-free domain model, services and storage ports
  database/   Drizzle schema, migrations, repository adapters, Postgres + Redis clients, job queue
  ai/         Capability-based AI contracts; vendor SDKs live behind them
  storage/    ObjectStorageProvider implementations; local disk today, S3/R2 later
  ui/         Shared Tailwind + Radix primitives (consumed as source)
  config/     Environment schemas and validation

infra/        Docker Compose for local Postgres and Redis
docs/         Design, UX and brand reference material (see below)
assets/       Shared SVG icon set from the design package
```

Dependencies point one way: `apps/*` → `packages/database` → `packages/domain`. The
domain defines the storage _ports_; the database package provides the Postgres
adapters. Nothing points back into an app.

## Design and brand reference

`docs/` holds the imported design package — reference material and source of truth
for the product's visual language, not generated output. See [`docs/README.md`](docs/README.md)
for the package's own description of its contents.

- [`docs/design/style-guide.md`](docs/design/style-guide.md) — visual language: typography,
  color, layout, AI styling and brand usage.
- [`docs/design/frontend-design-system-and-implementation-spec.md`](docs/design/frontend-design-system-and-implementation-spec.md)
  — implementation-facing React/Tailwind component specification.
- [`docs/design/page-by-page-ux-spec.md`](docs/design/page-by-page-ux-spec.md) — UX behavior
  per surface, from Home through Playtesting.
- [`docs/brand/brand-direction.md`](docs/brand/brand-direction.md) and
  [`docs/brand/explorations/`](docs/brand/explorations) — naming and logo development.
- [`docs/mockups/`](docs/mockups) — high-fidelity product explorations.
- [`docs/source/`](docs/source) — raw design source retained for reference.
- [`assets/icons/`](assets/icons) — 24x24 rounded-stroke SVG icon set using `currentColor`.

The product name is **Level Zero**; the tagline is **Ideas to Play.**, with **Before Level
One.** as the secondary line. The current mark is the minimal isometric foundation tile,
in blue and monochrome variants. Some mockups still carry the earlier **Workbench** working
name — treat that naming as historical, and the interaction and visual design as current.

## The domain model

A project is a graph of **canonical entities**. A character, a mechanic, a location
and a loose idea are all `Entity` rows: one identity, one lifecycle, one place to
look. A new tool is a new _view_ over these, never a new store.

```text
Project ──owns──> Entity (type, name, description, status, tags, data, currentVersionId)
                    │
                    ├──EntityRelationship(relation, metadata)──> Entity
                    │
                    └──EntityVersion(number, parent, branch, snapshot, reason)
```

Entity types: `idea`, `design_pillar`, `character`, `location`, `faction`,
`region`, `lore`, `event`, `hazard`, `culture`, `technology`, `mechanic`,
`system`, `asset_reference`, `scene`, `moodboard`, `document`, `prototype`, `build`.

Relations: `contains`, `references`, `inspired_by`, `generated_from`,
`derived_from`, `promoted_to`, `depends_on`, `implements`, `appears_in`,
`belongs_to`, `controls`, `replaces`.

Rules that hold across the codebase:

- **One table, many types.** Type-specific fields live in `data` (JSONB), so an
  early experiment can change shape without a migration. Add a type-specific
  _table_ only when a field needs constraints or indexes that JSONB cannot give.
- **Assets and generations are not entities.** `asset_reference` is an entity that
  _points at_ an `Asset` row (via `data.assetId`); the asset itself — its file,
  metadata and storage key — is a separate concept. A character portrait, a
  moodboard tile and a GDD figure can all point at the _same_ asset by linking
  their own entities to the same `asset_reference`, so nothing is duplicated and
  there is no `character_images` or `moodboard_images` table.
- **Project scoping is structural.** Every repository method takes `projectId`, and
  every statement carries it — including lookups by primary key. Reading another
  project's entity reports "not found" rather than "forbidden", so a caller cannot
  probe for the existence of rows it may not see.
- **Archive, never delete.** Archiving flips a status and hides the entity from
  listings. The row stays, so relationships and lineage that point at it survive.
- **Relationships are rows, not foreign keys.** A character links to a faction, a
  location, a mechanic and an asset reference without any of them being copied or
  owned. Edges are directional and read source-first: `A contains B`.
- **Lineage is history, not opinion.** `inspired_by`, `generated_from`,
  `derived_from`, `promoted_to` and `replaces` record how something came to
  exist, so they cannot be unlinked (409). Structural relations can be edited
  freely.
- **Promotion is additive.** Promoting an idea into a mechanic creates a new
  entity and a `promoted_to` edge. The idea is untouched — it is still an idea,
  and it can be promoted more than once.
- **The entity is the working copy; versions are what you chose to keep.**
  Editing an entity does not write a version, so autosave and undo (issue #14)
  cannot flood history. `commit` records the current content;
  `Entity.currentVersionId` is the pointer, like a branch HEAD.
- **History is append-only.** Restore, branch and promote all _add_ a version.
  Restoring version 1 creates a new version whose parent is whatever was
  current, so everything made after version 1 is still there and still
  reachable. Nothing rewrites or removes a version row.
- **Versions form a DAG.** `parentVersionId` is the edge, `branchName` labels the
  line of work, and `versionNumber` orders them within the entity — enough to
  draw a branch graph without a second query.
- **Domain logic lives in the domain.** `EntityService` and `ProjectService` are
  plain classes over storage ports. Controllers call them; nothing calls a
  repository or Drizzle directly, and no page component contains a rule.

`@level-zero/domain/testing` ships in-memory repositories so services and
controllers can be tested without a database. The Postgres adapters are covered
separately by integration tests against real Postgres.

### Assets

```text
Project ──owns──> Asset (kind, filename, mimeType, byteSize, storageKey, checksum,
                          width, height, durationSeconds, variant, sourceAssetId)
```

`AssetService` composes the `AssetRepository` port with an `ObjectStorageProvider`
port — the same provider-behind-an-interface shape as `@level-zero/ai`'s
`AiProvider` — so metadata (Postgres) and bytes (disk, later S3/R2) are
persisted independently, and the recorded `storageKey` is never a provider URL.
`@level-zero/storage`'s `LocalObjectStorageProvider` is the local-development
implementation; a production one is a different registration in
`apps/api/src/infrastructure/storage.module.ts`, nothing else.

`variant` (`source` / `thumbnail` / `preview`) and `sourceAssetId` leave room for
derivatives without a generation pipeline: a thumbnail declares the source asset
it was made from, and the database enforces the pairing (a `source` asset has no
`sourceAssetId`; anything else must have one).

### Generations

```text
Project ──owns──> Generation (capability, provider, model, prompt, parameters, status,
                              inputEntityIds, inputAssetIds, contextEntityIds,
                              outputAssetIds, parentGenerationId, seed,
                              providerRequestId, failure)
```

Every AI output can explain itself. `GenerationService` writes the record
**before** dispatching provider work, then only ever moves it forward:
`queued` → `running` → `complete` / `failed` / `cancelled`. The prompt,
parameters and inputs are never rewritten, so a failure keeps its diagnostics
_and_ the request that produced them, and a retry is a new generation carrying
`parentGenerationId` back to the one it re-rolls.

- **Outputs are Assets, not provider URLs.** A generated image is an ordinary
  `Asset` uploaded through `AssetService`, reusable everywhere a file is.
- **Provenance is one row.** The id lists live on the generation, so "how was
  this made" is a single query — from the output asset (`?outputAssetId=`) or
  from an entity that influenced it (`?entityId=`, matching named inputs and
  project context alike). GIN indexes serve both.
- **Lineage stays in the graph.** Completing a generation with output entities
  writes ordinary `generated_from` relationships through `LineageService`, so
  there is no second, parallel lineage mechanism. Sources already recorded are
  skipped, which makes regenerating the same entity idempotent.
- **The database enforces the states.** A terminal status must carry a
  `completedAt`, only a `failed` generation may carry `failure`, and a
  generation something was re-rolled from cannot be deleted.

### AI orchestration and project context

```text
ContextRequest ──ContextResolver──> ResolvedContext ──> Generation.resolvedContext
                                          │
AiCapability ──AiProviderRegistry──> AiProvider ──> AiResult ──> Asset
```

A feature asks for a **capability** — `text.generate`, `image.generate` — and
`AiProviderRegistry` picks a provider. Registration order is preference order,
and a provider that fails falls through to the next candidate for the same
capability, so a feature never names a vendor and never handles one being down.

- **The resolver assembles the prompt's world.** `ContextResolver` starts from
  what the user pointed at — a selection, an `@mention`, a reference asset, the
  generation being re-rolled — and walks the relationship graph outwards, so a
  request about a character arrives carrying the location, faction and mechanic
  it is actually linked to. Document entities come in as their headed sections.
- **Context is resolved once, when the request is made.** `POST /generations`
  resolves it and stores it on the record, so the worker sends the project as it
  was when the user asked rather than whenever the queue got there.
- **Every member says why it is there.** Each entry carries its source
  (`selected`, `mention`, `related`, `reference`, `lineage`), how many hops out
  it was found, and the edge it came through — which is what makes an assembled
  context inspectable, and what `resolvedContext` keeps for provenance. Entities
  the user named become the generation's `inputEntityIds`; the ones the walk
  found become `contextEntityIds`.
- **Archived material stays out.** The walk skips archived entities, though one
  the user named explicitly is still included.
- **Provider output becomes an Asset.** Text is stored as `text/plain`, files as
  themselves, both through `AssetService` — so nothing records a provider URL
  and a generated GDD section is read back exactly like a generated portrait.
- **Adapters own their vendor.** `AnthropicProvider` is the only file that knows
  what an Anthropic request looks like; `LocalImageProvider` serves
  `image.generate`, `image.edit` and `image.variation` with no credentials, the
  way `LocalObjectStorageProvider` serves object storage. Swapping in a hosted
  image model is one registration in `apps/worker/src/index.ts` and nothing else.
- **Reference bytes are separate from reference provenance.** `ResolvedContext`
  names the assets a request leans on, because that is what is stored on the
  record; `AiRequest.references` carries their bytes, which is what an editing or
  variation model needs and what no JSON snapshot can hold. The worker reads them
  from the generation's `inputAssetIds` through `AssetService`.

Set `ANTHROPIC_API_KEY` to enable the Anthropic adapter; without it the echo
provider is registered so local development still runs end to end. Both server
processes read it: the worker runs queued generations, and the API answers the
editor's inline AI suggestions inside the request, because a writer waiting on a
rewrite of the sentence they selected has nothing to walk away to.

### Prototypes

```text
Project ──owns──> Entity (type: prototype)
                    │
                    └──PrototypeVersion(number, name, status, notes, buildAssetId)
                          │
                          └──pins──> EntityVersion (one per included entity)
```

A prototype is an ordinary entity, so it has a name, tags, status and a place in
the graph like everything else. What `PrototypeVersion` adds is the part an
entity cannot express: the exact `EntityVersion` rows the experiment was built
from.

- **Pins are resolved once, at capture.** Including an entity without naming a
  version records the entity's _current_ version there and then. Nothing is
  re-resolved on read, so v1 still answers with the diver, the oxygen mechanic
  and the trench as they were played, however far the entities have moved on.
- **The pins are immutable; the annotations are not.** `status`, `notes` and
  `buildAssetId` can be updated — a build is produced _after_ the versions going
  into it are chosen — but a different set of versions is a new prototype
  version, never an edit of an old one.
- **Comparison is per entity.** Comparing two versions reports `added`,
  `removed` and `changed` members, where a change is one entity moving from one
  `EntityVersion` id to another.
- **The database enforces the history.** A member row references
  `entity_versions(id, entity_id, project_id)` with `ON DELETE RESTRICT`, so a
  pinned version cannot be deleted, cannot belong to another entity and cannot
  come from another project. The build artifact and the prototype entity are
  protected the same way.

### Background jobs

```text
Project ──owns──> Job (kind, targetId, status, progress, attempt/maxAttempts, failure)
```

Nothing long-running happens inside a request. `POST /generations` records the
request, queues a `Job` for it and returns; the worker process picks the job up,
calls the provider and moves both records forward. The job's states are what a
progress indicator needs to say something true: `queued`,
`preparing_context`, `running`, `processing`, then `complete`, `failed` or
`cancelled`.

- **The row is the state, not the queue.** Redis carries a job's identity and
  nothing else, so a browser reconnecting after a refresh and a worker starting
  a second attempt read the same record. A flushed queue loses throughput, not
  history.
- **Progress is explicit.** `progress` is `{ completed, total, step }`, so a UI
  can say "2 of 3 — Generating" rather than animating an indeterminate bar. The
  step names live in `GENERATION_JOB_STEPS`, which the API sizes the job from
  and the worker reads as it goes.
- **Retries belong to the queue.** BullMQ applies exponential backoff up to the
  record's `maxAttempts`; the worker reports which happened, so `attempt` on the
  row and the schedule in Redis cannot drift. A job waiting for its next attempt
  keeps the failure that caused it.
- **Cancelling is one action.** `POST /generations/:id/cancel` cancels the
  generation _and_ its job, dropping it from the queue. A worker already inside a
  provider call stops at its next step, because that call cannot be recalled.
- **Changes are pushed, not polled.** The worker publishes each state change on
  Redis; `GET /jobs/stream` relays them to the browser as server-sent events.
  Delivery is best effort — a client that misses one re-reads the record.

### Documents

```text
Project ──owns──> Entity (type: document, data.content = structured body)
                    │
                    └──EntityVersion(number, snapshot, reason, metadata.name)
```

A GDD, a brief and a playtest write-up are all `document` entities, and their
history is the entity history every other game object already has. There is no
document table and no document version table: duplicating entity identity for
the sake of a text editor is the exact thing the entity model exists to prevent.

- **The structured body is canonical.** `data.content` holds the editor's JSON
  document node, never rendered HTML. Everything inside it — headings, tables,
  entity mentions, asset embeds — is stored and restored untouched, so a custom
  node survives saving and versioning without the domain knowing what it is.
  HTML, Markdown and PDF are export formats layered on top of it.
- **Autosave and versions are different acts.** `PUT …/content` replaces the
  working copy and writes no version, so a writer pausing for breath cannot
  flood the history; undo and redo stay the editor's own. A version is a
  deliberate event — a named snapshot, a milestone, an accepted AI edit, a
  playtest — which is exactly the reason list `EntityVersion` already carries.
- **Restoring adds.** A restore appends a new version whose parent is whatever
  was current, so the work done after the restored point is still there.
- **A version list carries no bodies.** The history endpoint returns metadata
  per version; a body arrives only when one version is read or two are compared,
  which hands back both sides for a side-by-side view rather than diffing prose.

### Search and retrieval

```text
Entity ─┐
Asset  ─┼─indexed as──> SearchDocument (title, body, tags, search_vector, embedding)
Generation ─┘                 │
                              └──EmbeddingProvider──> vector ──cosine──> results
```

One question reaches everything in a project. A `SearchDocument` is the
searchable copy of one canonical record — an entity, an asset or a generation —
so a character, a GDD section, a concept image and a prompt come back in one
ranked list carrying the type and project behind each hit.

- **Search documents are derived, not canonical.** Every row can be rebuilt from
  the record it mirrors, which is why it is not an `Entity` and why nothing
  reads a search result as a source of truth: it carries `sourceType`,
  `sourceId` and the `sourceVersionId` it was indexed at, and a caller follows
  those back.
- **Documents, prototypes and builds are entity types, not source types.** They
  are indexed as entities and told apart by `entityType`, so a GDD is one row in
  one table rather than a parallel document index. A document's body — the
  editor's JSON — is flattened to its prose on the way in.
- **The text follows a change immediately; the vector does not.** A write
  updates the searchable copy in the same request, so a rename or an autosaved
  paragraph is findable at once. Building an embedding is a provider call, so a
  change only marks the row stale and makes sure a `search_index` job is
  queued — one per project, not one per edit — and the worker does the rest.
- **The vector's model is part of the row.** `embedding_model` and the vector's
  width are matched before anything is compared, so swapping models degrades to
  "not indexed yet" rather than to nonsense.
- **An index failure never fails the write that caused it.** The canonical row
  is already saved by the time the index is told, so the searchable copy is
  written best effort and logged if it cannot be — otherwise a broken index, or
  a queue that cannot be reached, would turn creating an idea or autosaving a
  GDD into an error. Nothing is lost: every `search_index` job rebuilds the
  index from the canonical tables.
- **A hit has to be a hit.** Semantic retrieval applies a similarity floor, so
  "closest first" cannot quietly return the entire project ranked and an empty
  result stays a real answer.
- **Keyword ranking is Postgres', not ours.** `search_vector` is a generated
  column, so the text a query matches cannot drift from `title` and `body`, and
  `websearch_to_tsquery` accepts what people already type — bare words,
  `"quoted phrases"`, `or`, `-excluded` — with the title weighted above the body.
- **Semantic retrieval is a dot product over stored unit vectors.** The
  embedding is a `double precision[]` rather than pgvector's `vector`, because
  the `postgres:16-alpine` image the stack runs does not carry the extension;
  moving to pgvector later is a column type and an ANN index, not a change to
  how any of this is used.
- **Scoping is structural, as everywhere else.** Every statement carries
  `project_id`, so a search cannot reach another project's material, and the
  same filters — source type, entity type, status, tags, updated range — apply
  whether the question was words or a vector.

`EmbeddingProvider` is a port in `packages/domain`, the same shape as
`ObjectStorageProvider`: `@level-zero/ai`'s `LocalEmbeddingProvider` hashes
words and their character trigrams into a fixed-width unit vector, so semantic
retrieval runs with no credentials. It is a stand-in, not a language model —
swapping in a hosted embedding model is one registration in
`apps/api/src/infrastructure/embedding.module.ts` and the matching line in
`apps/worker/src/index.ts`, and nothing else.

### API

| Endpoint                                                                  | Purpose                                               |
| ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `POST   /api/projects`                                                    | Create a project                                      |
| `GET    /api/projects`                                                    | List projects (`status`, `search`, `limit`, `offset`) |
| `GET    /api/projects/:projectId`                                         | Read a project                                        |
| `PATCH  /api/projects/:projectId`                                         | Update name/description                               |
| `POST   /api/projects/:projectId/archive` · `/restore`                    | Change project state                                  |
| `POST   /api/projects/:projectId/entities`                                | Create an entity                                      |
| `GET    /api/projects/:projectId/entities`                                | List/filter entities                                  |
| `GET    /api/projects/:projectId/entities/:entityId`                      | Read an entity                                        |
| `PATCH  /api/projects/:projectId/entities/:entityId`                      | Update an entity                                      |
| `POST   /api/projects/:projectId/entities/:entityId/archive` · `/restore` | Change entity state                                   |

Listing accepts `type`, `status`, `tag` (repeated or comma-separated),
`search`, `includeArchived`, `limit` and `offset`, and returns
`{ items, total }` so a UI can page without losing the count. Tag matching is
case-insensitive; `PATCH` replaces `data` wholesale so a field can be removed.

The relationships endpoint returns `{ entity, outgoing, incoming }`, with the
entity on the far end of every edge resolved and its status included — archived
neighbours stay visible rather than vanishing from the graph. It accepts
`direction` (`outgoing`/`incoming`/`both`) and `relation` filters.

The versions endpoint returns `{ entityId, currentVersionId, branches, versions,
total }`. Comparison is field-level and looks _inside_ type-specific data, so a
history view can say `data.drainPerSecond changed` rather than `data changed`.

Assets live under `/api/projects/:projectId/assets`: `POST` uploads (metadata plus
base64 `contentBase64`), `GET`/`GET :assetId` read, `GET :assetId/url` resolves a
safe URL through the configured provider, `GET :assetId/content` streams the
bytes back, and `POST :assetId/archive` · `/restore` change asset state. Linking
one into the entity graph is done with an `asset_reference` entity and the
relationships endpoint above, not a route here.

Generations live under `/api/projects/:projectId/generations`: `POST` records a
request before any provider is called and queues the work, returning
immediately with the generation id. A `context` block on that request
(`selectedEntityIds`, `mentionedEntityIds`, `assetIds`, `relatedDepth`,
`relations`, `maxEntities`) is resolved into the record's inputs and stored with
it; a caller that already knows its ids sends those instead. `POST :generationId/dispatch` ·
`/complete` · `/fail` · `/cancel` move it through its states — the worker uses
the same transitions, and `/cancel` also cancels the job running it — and
`GET :generationId/provenance` resolves a record's ids to the entities, assets
and parent generation they name. The listing filters by `status`, `capability`,
`parentGenerationId`, `outputAssetId` and `entityId`, which is how provenance is
read backwards from a generated image.

Prototypes live under `/api/projects/:projectId/prototypes`: `POST` creates the
prototype entity and captures its first version in one request,
`POST :prototypeId/versions` captures a later one, `GET :prototypeId/versions`
lists them newest first, `GET …/versions/compare?from=&to=` reports the added,
removed and changed entity versions, `GET …/versions/:prototypeVersionId/contents`
resolves a version to the entity versions and build artifact it names, and
`PATCH` on a version updates its status, notes or build artifact — never its
pins.

Documents live under `/api/projects/:projectId/documents`: `POST` creates one,
`GET` lists the project's documents, `GET :documentId` loads the body with its
current version and whether the working copy has moved on from it,
`PUT :documentId/content` autosaves, `POST :documentId/versions` takes a named
snapshot, `GET :documentId/versions` lists version metadata,
`GET …/versions/:versionId` reads one with its body,
`GET …/versions/compare?from=&to=` returns both bodies and what else changed,
and `POST …/versions/:versionId/restore` brings a version back as a new one.
`POST :documentId/ai/suggestions` answers one inline AI edit: it assembles the
document and the entities the passage mentions through `ContextResolver`,
records a `Generation`, and returns the suggested prose for the editor to
preview. Nothing is written to the document by asking — an accepted suggestion
arrives back through `PUT :documentId/content`, and a substantial one through
`POST :documentId/versions` with reason `ai_edit`.

Search lives under `/api/projects/:projectId/search`: `GET` answers the project's
one search, filtering by `sourceType`, `entityType`, `status`, `tag`,
`updatedAfter`/`updatedBefore` and `includeArchived`, and paging with `limit` and
`offset`. `mode=semantic` answers the same question from the embeddings instead
of the words, and returns the same result shape, so "the mechanic where oxygen
limits exploration" can reach a design that never uses those words. A page that
only cares about its own material sends `entityType`, which is the local search
the design spec describes. `POST search/reindex` queues a rebuild and answers
with the job running it — an index pass already running is returned rather than
duplicated.

Jobs live under `/api/projects/:projectId/jobs`: `GET` lists them (filtering by
`status`, `kind` and `targetId`, which is how a page finds the job running one
generation), `GET :jobId` reads one, and `GET stream` is a server-sent event
stream of every job change in the project. There is no route to start or cancel
a job directly: work is queued and cancelled through the feature that owns it.

Domain errors map to HTTP in one place: `NotFoundError` → 404,
`ValidationError` → 400, `ConflictError` → 409, each with a stable `error` code
and structured `details`.

## Architecture rules

These are the constraints the rest of the issues build on. Breaking one is a
review comment, not a preference:

- **Modular monolith.** Feature modules are added to `apps/api`, not split into
  separate deployables. The worker is a separate _process_, not a separate service:
  it shares the same packages.
- **Long-running work is queued, never awaited in a handler.** A domain service
  enqueues a `Job`; provider-specific execution belongs in the worker. No HTTP
  request stays open for a provider call.
- **Domain stays framework-free.** `packages/domain` must not import NestJS, React,
  Next, Drizzle, `pg` or `ioredis`. ESLint enforces this.
- **Provider integrations sit behind interfaces.** Feature code requests an AI
  _capability_ (`text.generate`, `image.generate`, …) and the registry picks a
  provider. Nothing outside an adapter imports a vendor SDK, and no feature
  assembles its own prompt context — that is `ContextResolver`'s job.
- **Environment is validated at startup.** Every process parses its variables
  through `@level-zero/config` and fails immediately, listing every problem at once.
  Browser code imports `@level-zero/config/env`, which has no Node built-ins.
- **Migrations are plain SQL and are applied, never pushed.** Every environment runs
  the same ordered steps from an empty database.

### Health endpoints

| Endpoint                | Meaning                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `GET /api/health/live`  | The process is running. Never touches dependencies.            |
| `GET /api/health/ready` | Dependencies are reachable. **503** while any of them is down. |
| `GET /api/health`       | Same payload as readiness, always 200 — for dashboards.        |
| `GET :3002/health`      | The worker's equivalent readiness endpoint.                    |

The Postgres probe reads a migrated table, so an un-migrated database reports
`down` rather than a misleading `up`.

## Adding a feature module

1. Put the model and rules in `packages/domain` (no framework imports), including
   the storage port the feature needs.
2. Add tables to `packages/database/src/schema` and an adapter under
   `src/repositories`, then `pnpm db:generate`.
3. Wire the service in `apps/api/src/domain/domain.module.ts` and add a NestJS
   module with its controller, registered in `app.module.ts`.
4. Add UI under `apps/web/src`, reusing `@level-zero/ui` primitives.

Before adding a table for a new kind of game object, check whether it is an
`Entity` type instead, and whether the link you need is an `EntityRelationship`
rather than a foreign key. Duplicating entity identity in a feature-specific
store is the thing this architecture exists to prevent.

### Guarantees the database enforces

Some rules are constraints rather than code, so they hold even for a caller that
bypasses the services:

- Relationship endpoints are referenced by `(entity_id, project_id)`, so an edge
  joining two projects **cannot be written at all**.
- Those references are `ON DELETE RESTRICT`, so an entity that lineage points at
  cannot be deleted out from under its history. Deleting a whole project still
  works, because the cascade removes the edges first.
- A unique constraint on `(source, target, relation)` stops duplicate edges, and
  a check constraint stops an entity relating to itself.
- Version rows are referenced by their children and by the entity they belong
  to, both `ON DELETE RESTRICT`, so no piece of history can be deleted while
  something descends from it.
- A unique constraint on `(entity_id, version_number)` keeps numbering monotonic
  even if two commits race: the loser fails with a 409 rather than reusing a
  number.
- A check constraint on `assets` stops the `variant`/`sourceAssetId` pairing from
  drifting: a `source` asset cannot carry a `sourceAssetId`, and every other
  variant must.
- A prototype's members reference `entity_versions(id, entity_id, project_id)`,
  so a pin cannot name another entity's or another project's history, and
  `ON DELETE RESTRICT` keeps that history alive for as long as something played
  it.
- Check constraints on `jobs` keep progress and attempts honest: a job cannot
  report more steps done than it has, and cannot exceed the attempts it was
  given.
- A search document's `search_vector` is a generated column and its
  `(source_type, source_id)` is unique, so the text a query matches cannot drift
  from the text that was indexed, and re-indexing a record replaces its row
  rather than adding a second one.

> **NestJS gotcha:** constructor injection relies on `design:paramtypes` metadata,
> which TypeScript only emits for _value_ imports. `@typescript-eslint/consistent-type-imports`
> is therefore disabled for `apps/api` — rewriting an injected class to a type-only
> import breaks dependency injection at runtime.

## CI

`.github/workflows/ci.yml` runs on every push and pull request against real Postgres
and Redis services: install (frozen lockfile) → format check → build → lint →
typecheck → migrations → tests.

**CI is currently disabled, not broken.** It was blocked at the GitHub account
level and the workflow was manually disabled on 2026-09-09 to stop every push
collecting a red X. Until it is re-enabled with `gh workflow enable CI`, run
`pnpm typecheck && pnpm lint && pnpm test` locally — nothing else is checking.

## Deployment

Level Zero runs on a k3s cluster, deployed from
[pmhood/k8s-gitops](https://github.com/pmhood/k8s-gitops) under
`applications/level-zero/` — three images plus a CloudNativePG cluster, a Redis
for the job queue, and a shared NFS volume for asset bytes. That directory's
README covers the cluster side; this section covers the half that lives here.

`docker/Dockerfile.{api,web,worker}` build the three deployable images.
`.github/workflows/publish.yml` would publish them on every green build, but it
is gated on the CI workflow above and so does not run today. **Publishing is
therefore a manual step:**

```bash
echo "$GITHUB_PAT" | docker login ghcr.io -u pmhood --password-stdin  # write:packages
scripts/publish-images.sh --rollout          # all three, then release
scripts/publish-images.sh api                # or just one, push only
scripts/publish-images.sh --dry-run          # build locally, push nothing
```

Each image is pushed as `:latest` and as `:<commit sha>`, and the script prints
the digest of what it pushed. It always builds `linux/amd64`: on an Apple
Silicon machine a native build produces an image the cluster cannot run, and the
symptom is a pod in `CrashLoopBackOff` with `exec format error`.

Three things about this are easy to get wrong.

**A publish is not a release.** The Deployments track `:latest` with
`imagePullPolicy: Always`, so nothing moves until the pods restart. `--rollout`
does that; without it the script prints the commands.

**Migrations do not run on boot.** The API and the worker both open the database
at startup, so either would race the other — instead the migration runs as an
Argo CD _Sync hook_. A manual publish changes no git, so no sync happens, and a
plain `kubectl rollout restart` starts new code against an old schema. That is
what `argocd app sync level-zero` in the `--rollout` path is for: it re-runs the
hook even with nothing diffed, and the script refuses to restart anything if the
migration fails.

**The web image is origin-specific.** Next inlines `NEXT_PUBLIC_*` into the
browser bundle at build time, so `https://level-zero.fakerainbow.com` is
compiled into `level-zero-web`. Serving Level Zero from another hostname means
rebuilding with `NEXT_PUBLIC_API_URL=...`, not editing a manifest — which is why
the Deployment sets no such variable.
