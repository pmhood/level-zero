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

Scope a command to one workspace with `pnpm --filter @level-zero/api <script>`.

Most tests are pure unit tests, but the repository adapters are covered by
integration tests against real Postgres, so `pnpm test` expects
`pnpm infra:up && pnpm db:migrate` to have run first. CI does the same against
service containers.

## Layout

```text
apps/
  web/        Next.js + React (App Router, Tailwind, TanStack Query, Zustand)
  api/        NestJS modular monolith
  worker/     Independently executable background process

packages/
  domain/     Framework-free domain model, services and storage ports
  database/   Drizzle schema, migrations, repository adapters, Postgres + Redis clients
  ai/         Capability-based AI contracts; vendor SDKs live behind them
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
`mechanic`, `system`, `asset_reference`, `scene`, `document`, `prototype`, `build`.

Relations: `contains`, `references`, `inspired_by`, `generated_from`,
`derived_from`, `promoted_to`, `depends_on`, `implements`, `appears_in`,
`belongs_to`, `replaces`.

Rules that hold across the codebase:

- **One table, many types.** Type-specific fields live in `data` (JSONB), so an
  early experiment can change shape without a migration. Add a type-specific
  _table_ only when a field needs constraints or indexes that JSONB cannot give.
- **Assets and generations are not entities.** `asset_reference` is an entity that
  _points at_ an asset; the asset itself is a separate concept (issue #5).
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

Domain errors map to HTTP in one place: `NotFoundError` → 404,
`ValidationError` → 400, `ConflictError` → 409, each with a stable `error` code
and structured `details`.

## Architecture rules

These are the constraints the rest of the issues build on. Breaking one is a
review comment, not a preference:

- **Modular monolith.** Feature modules are added to `apps/api`, not split into
  separate deployables. The worker is a separate _process_, not a separate service:
  it shares the same packages.
- **Domain stays framework-free.** `packages/domain` must not import NestJS, React,
  Next, Drizzle, `pg` or `ioredis`. ESLint enforces this.
- **Provider integrations sit behind interfaces.** Feature code requests an AI
  _capability_ (`text.generate`, `image.generate`, …) and the registry picks a
  provider. Nothing outside an adapter imports a vendor SDK.
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

> **NestJS gotcha:** constructor injection relies on `design:paramtypes` metadata,
> which TypeScript only emits for _value_ imports. `@typescript-eslint/consistent-type-imports`
> is therefore disabled for `apps/api` — rewriting an injected class to a type-only
> import breaks dependency injection at runtime.

## CI

`.github/workflows/ci.yml` runs on every push and pull request against real Postgres
and Redis services: install (frozen lockfile) → format check → build → lint →
typecheck → migrations → tests.
