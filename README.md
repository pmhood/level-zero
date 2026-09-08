# Level Zero

Workbench — a connected game-development workspace, built as a **modular monolith**.

This repository is the bootstrap slice ([#13](https://github.com/pmhood/level-zero/issues/13)):
the monorepo, the API, the worker, the shared packages, and the local development
environment that the rest of the architecture ([#1](https://github.com/pmhood/level-zero/issues/1))
is built on.

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

## Layout

```text
apps/
  web/        Next.js + React (App Router, Tailwind, TanStack Query, Zustand)
  api/        NestJS modular monolith
  worker/     Independently executable background process

packages/
  domain/     Framework-free domain model and shared kernel
  database/   Drizzle schema, migrations, Postgres + Redis clients
  ai/         Capability-based AI contracts; vendor SDKs live behind them
  ui/         Shared Tailwind + Radix primitives (consumed as source)
  config/     Environment schemas and validation

infra/        Docker Compose for local Postgres and Redis
```

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

1. Put the model and rules in `packages/domain` (no framework imports).
2. Add tables to `packages/database/src/schema`, then `pnpm db:generate`.
3. Add a NestJS module under `apps/api/src`, and register it in `app.module.ts`.
4. Add UI under `apps/web/src`, reusing `@level-zero/ui` primitives.

> **NestJS gotcha:** constructor injection relies on `design:paramtypes` metadata,
> which TypeScript only emits for _value_ imports. `@typescript-eslint/consistent-type-imports`
> is therefore disabled for `apps/api` — rewriting an injected class to a type-only
> import breaks dependency injection at runtime.

## CI

`.github/workflows/ci.yml` runs on every push and pull request against real Postgres
and Redis services: install (frozen lockfile) → format check → build → lint →
typecheck → migrations → tests.
