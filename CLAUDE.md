# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Level Zero is an AI-native game-development workspace: the space before Level One, where a game
goes from a rough idea to something playable. `README.md` documents setup, the full command table,
the domain model and the database guarantees — read it rather than re-deriving any of that here.
This file covers what a README reader still gets wrong.

## Commands

`pnpm dev` / `build` / `typecheck` / `lint` / `test` run across the workspace via Turborepo. The
full table, including the `db:*` and `infra:*` commands, is in `README.md`.

```bash
pnpm --filter @level-zero/api test          # one workspace
pnpm --filter @level-zero/ui exec vitest run src/ui.test.tsx   # one file
pnpm --filter @level-zero/ui exec vitest run -t "renders"      # one test by name
```

Workspaces: `@level-zero/{web,api,worker}` (apps) and `@level-zero/{domain,database,ui,ai,config,storage}`
(packages).

**`pnpm test` needs live infrastructure.** The repository adapters are integration-tested against
real Postgres, so run `pnpm infra:up && pnpm db:migrate` first or those suites fail on connection,
not on logic. CI does the same against service containers.

## Design documentation — read before any UI work

`docs/` is imported design material and the **source of truth for anything user-facing**. It is
deliberately exempt from Prettier (see `.prettierignore`) because it is authored reference, not
generated output — do not reformat or rewrite it to match a diff you are making.

| Document                                                                                                                         | Read it when                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`docs/design/style-guide.md`](docs/design/style-guide.md)                                                                       | Any visual decision: color, type scale, spacing, radius, imagery, AI language                                                                    |
| [`docs/design/frontend-design-system-and-implementation-spec.md`](docs/design/frontend-design-system-and-implementation-spec.md) | Building a component — 50 sections of concrete specs, from app shell and sidebar through buttons, inspector, GDD editor, motion and focus styles |
| [`docs/design/page-by-page-ux-spec.md`](docs/design/page-by-page-ux-spec.md)                                                     | Building a screen — Home, Overview, Idea Lab, Moodboards, World, Characters, Mechanics, GDD, Prototype, Assets, Build, Playtesting               |
| [`docs/brand/brand-direction.md`](docs/brand/brand-direction.md)                                                                 | Naming, logo, tagline                                                                                                                            |
| [`docs/mockups/`](docs/mockups)                                                                                                  | The intended visual result of any of the above                                                                                                   |
| [`assets/icons/`](assets/icons)                                                                                                  | 24×24 rounded-stroke SVGs on `currentColor`; use these before adding an icon dependency                                                          |

Check the spec for a component **before** writing one. It already specifies buttons, inputs, tabs,
cards, status badges, tags, panels, the inspector, tables, empty states, loading states, modals and
drawers. Inventing a parallel version of something the spec defines is a review comment.

### The current tokens contradict the design system

`packages/ui/src/styles.css` was scaffolded before the design package landed. It defines generic
`oklch` tokens whose `--color-primary` is a **violet** — but the style guide reserves purple
(`#A982F4`) exclusively for AI/generative actions, with Level Zero Blue (`#42A5FF`) for all normal
interaction. Spec §2 defines the real palette as hex variables.

The design docs win on **values**. The first UI issue that touches theming should reconcile
`packages/ui/src/styles.css` with spec §2 rather than building on top of tokens that are already
wrong, and should say so in its PR. Don't quietly add a second palette alongside the existing set
and leave two competing ones.

**Name the tokens `--lz-*`, not the spec's `--wb-*`.** The spec's prefix is the old Workbench
working name; the values are current but the prefix is not. Take spec §2's palette verbatim and
rename the prefix as you go — `--wb-bg-canvas` becomes `--lz-bg-canvas`, and so on. This is a
decided convention, not a judgment call to re-make per component: no new `--wb-*` variable should
enter the codebase.

### Naming

The product is **Level Zero**. Tagline **Ideas to Play.**, secondary line **Before Level One.**
The mark is the minimal isometric foundation tile, blue and monochrome.

**Workbench** was the working name and survives in mockups, in the design system spec's own title
and token prefix, in icon filenames (`workbench-logo.svg`), and in some code and copy. Treat it as
historical: don't propagate it into new user-facing strings or new identifiers (hence `--lz-*`
above), and don't launch a repo-wide rename of what already exists as a side effect of another
change — that is its own task.

## Architecture

`README.md` has the layout, the architecture rules and the database guarantees. The parts that bite:

- **Dependencies point one way:** `apps/*` → `packages/database` → `packages/domain`. The domain
  defines storage _ports_; the database package provides Postgres adapters. Nothing points back
  into an app.
- **`packages/domain` is framework-free** — no NestJS, React, Next, Drizzle, `pg` or `ioredis`.
  ESLint enforces this with `no-restricted-imports`; if you are reaching for a framework there, the
  logic is in the wrong package.
- **Before adding a table for a new kind of game object, check whether it is an `Entity` type and
  whether the link you want is an `EntityRelationship`.** One table holds every entity type with
  type-specific fields in JSONB `data`. Duplicating entity identity in a feature-specific store is
  the exact thing this architecture exists to prevent — it is the difference between a connected
  workspace and a pile of independent generators.
- **Assets and generations are not entities**, and provider integrations sit behind capability
  interfaces (`text.generate`, `image.generate`, …). Nothing outside an adapter imports a vendor SDK.
- **Migrations are plain SQL, generated then applied** — `pnpm db:generate` after editing
  `packages/database/src/schema`, never a schema push.
- **Long-running work goes through a `Job`**, enqueued by a domain service and run in
  `apps/worker`. The Postgres row is the state; Redis carries only the job's identity.
  BullMQ gets its own ioredis connection (`maxRetriesPerRequest: null`, and BullMQ's own
  `prefix` rather than ioredis' `keyPrefix`, which it does not support) — reusing the
  shared `createRedisClient` connection breaks it in ways that only show up at runtime.
- **NestJS gotcha:** `@typescript-eslint/consistent-type-imports` is disabled for `apps/api` because
  constructor injection needs `design:paramtypes`, which TypeScript only emits for value imports.
  Rewriting an injected class to `import type` breaks DI at runtime.

Adding a feature module: domain model and port → schema and repository adapter → wire into
`apps/api/src/domain/domain.module.ts` and a NestJS module → UI reusing `@level-zero/ui`. The
expanded version is in `README.md`.

## Stack notes

Next.js 16 App Router, React 19, Tailwind v4 (CSS-first: `@theme` in `packages/ui/src/styles.css`,
no `tailwind.config.js`), NestJS, Drizzle, Vitest, pnpm workspaces + Turborepo.

`packages/ui` is consumed **as source**, so `apps/web/src/app/globals.css` has an explicit
`@source '../../../../packages/ui/src'` for Tailwind to scan it. A new shared component that never
renders its styles is usually this line, not the component.

Design system spec §1 names the intended additions — Radix, shadcn/ui, Lucide, Framer Motion,
TanStack Table, React Flow, tldraw, TipTap, Monaco, Recharts, cmdk — and says not to introduce
other UI frameworks without a clear need.

## Working in this repo

- Commit subjects are imperative and unprefixed: `Add entity relationships and creative lineage`.
  No Conventional Commits, no scope tags.
- Issues carry `effort:` and `model:` labels that drive the `/do` and `/do-next` pipelines, and
  `needs-review` means the issue has open questions and should not be worked unattended. Many issue
  bodies list `Depends on: #N` — check those are closed before starting.
- **CI is currently blocked at the GitHub account level** ("recent account payments have failed"),
  so no workflow has run since 2026-09-08. Jobs fail in ~3s having executed zero steps; that is
  billing, not the diff. Run `pnpm typecheck && pnpm lint && pnpm test` locally — nothing else is
  checking.
