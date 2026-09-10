# The playtest record model: entities or tables

**Status:** decided for #85. Implemented by #63; inherited by #64 and #65.

**Verdict in one line:** none of the five concepts is an `Entity`. All five get their own tables —
`playtests`, `playtest_sessions`, `playtest_observations`, `playtest_feedback`,
`playtest_metrics` — the tested version is pinned by a composite foreign key onto
`prototype_versions(id, project_id)` with `ON DELETE RESTRICT`, categories are free `text[]` tags,
and `Metric` borrows `parameterId()` and the units convention from `Parameter` without embedding a
`Parameter`.

This document decides a data shape and its guarantees. It adds no schema, no migration and no
service code, and it deliberately decides nothing about #64's UI.

Everything asserted below about existing code was read on **2026-09-09** at
`72dc538`. File and symbol references are given so each claim can be checked.

---

## 1. Why this exists

#63 introduces five concepts in one issue — `Playtest`, `PlaytestSession`, `Observation`,
`Feedback`, `Metric` — and `CLAUDE.md` and `README.md` §"Adding a feature module" both name the
check they force:

> Before adding a table for a new kind of game object, check whether it is an `Entity` type
> instead, and whether the link you need is an `EntityRelationship` rather than a foreign key.
> Duplicating entity identity in a feature-specific store is the thing this architecture exists to
> prevent.

The check has an answer here, and the answer is not obvious, because the repo has already made
this call in both directions. Getting it wrong is expensive in exactly the direction the rule
exists to prevent, and it gets more expensive once #64 and #65 render on top of it.

---

## 2. The test the repo has already been applying

Read against the code rather than restated from principle, three precedents draw one line.

### 2.1 `prototype` is an entity; `PrototypeVersion` is not

`packages/domain/src/entity/entity-type.ts` lists 19 `ENTITY_TYPES`, `prototype` among them, under
a comment that is the rule in miniature:

> Every tool reads and writes these same canonical entities. Adding a tool does not mean adding a
> store: it means adding a view over one of these types.

`packages/domain/src/prototype/prototype-version.ts` then explains why the *version* is not one:

> The prototype itself is an ordinary `Entity` of type `prototype` — identity, name, tags and
> status live there, like every other game object. This row is the part an entity cannot express:
> an immutable set of `EntityVersion` references […]

The deciding property is not importance or size. It is **whether the thing needs a shape an
entity cannot hold.** An entity holds identity, name, description, status, tags and a schemaless
JSONB `data` (`packages/database/src/schema/entities.ts`). A prototype version needs a set of rows
that the *database* refuses to let drift, and JSONB cannot carry a foreign key.

### 2.2 Assets and Generations are not entities either

`packages/domain/src/asset/asset.ts`: "An asset is not an entity and carries no feature-specific
foreign keys." `packages/domain/src/generation/generation.ts`: "A generation is not an entity and
not an asset: it is the record of an act." Both have their own tables and services.

The generation comment adds the second half of the test:

> Creative lineage *between entities* stays in `EntityRelationship` (`generated_from`) […] this row
> never becomes a second, parallel graph.

So a record about entities is allowed its own table; what it is not allowed is to re-express
entity identity or the entity graph.

### 2.3 The line, stated once

| A thing is an `Entity` when                             | A thing gets its own table when                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| It is part of the game being designed                   | It is evidence, provenance or bookkeeping *about* the game                  |
| Versioning, branching, promotion and restore make sense | Those operations are meaningless or actively wrong for it                   |
| Its fields fit identity + tags + schemaless `data`      | It needs a column the database must constrain (a foreign key, a check)      |
| A tool should be a *view* over it                       | It is written once by one workflow and read by others                       |

Applied honestly, this is a strong test: `moodboard` is an entity but `moodboard_nodes` is a table
(`packages/database/src/schema/moodboards.ts`, same reasoning, same wording); `document` is an
entity because a GDD *is* game content.

---

## 3. Verdicts

### 3.1 Playtest — **own table**, `playtests`

A playtest is a record of an act, like a `Generation`. It is not part of the game; it is evidence
about a version of the game. Two of the four rows of §2.3's test decide it outright:

- **Versioning is wrong for it.** An entity is versioned, branched, promoted, restored and
  compared by `packages/domain/src/version/entity-version.ts`. Branching a playtest is meaningless
  and restoring one to an earlier state destroys the record. Note that `VERSION_REASONS` already
  contains `'playtest'` — a playtest is a *reason a design version exists*, which is the opposite
  of the playtest itself being a version.
- **Its hardest field cannot live in `data`.** A `Playtest` must name the exact
  `PrototypeVersion` tested, and #63 makes that its top constraint. In an entity that reference
  would be a string inside schemaless JSONB with no foreign key, no project scoping and no delete
  protection — the guarantee would be a convention. §5 shows what it is instead.

This is the same call `PrototypeVersion` made, for the same reason.

### 3.2 PlaytestSession — **own table**, `playtest_sessions`

One concrete run within a playtest. It has no life outside its parent, no name worth searching on
its own, and nothing to version. A child table with `ON DELETE CASCADE` from `playtests` is the
whole requirement.

### 3.3 Observation — **own table**, `playtest_observations`

### 3.4 Feedback — **own table**, `playtest_feedback`

### 3.5 Metric — **own table**, `playtest_metrics`

Three tables, not one discriminated table and not one folded into another. §4 is the argument,
because "how many tables" is the question with the least obvious answer.

---

## 4. How many tables for Observation, Feedback and Metric

The issue is right that all three are "something recorded during a session". The repo has a
discriminated table already — `moodboard_nodes`, with a `type` enum, nullable `asset_id` /
`entity_id` and a check constraint keeping the pairing honest — so the pattern is available and
idiomatic here. The question is whether these three earn it.

**The test:** a discriminator earns its keep when rows of different kinds are *read in one pass,
ordered together, and share most of their columns.* `moodboard_nodes` passes all three: every node
type is geometry on one board, and the board is rendered as one z-ordered list, so an `asset` node
and a `text` node genuinely differ by two columns out of a dozen.

Observation, Feedback and Metric fail all three.

| | Observation | Feedback | Metric |
| --- | --- | --- | --- |
| Distinct columns | `body`, `at_seconds`, `entity_id`, `observed_by` | `body`, `participant`, `sentiment` | `metric_key`, `label`, `value`, `unit` |
| Read as | a timeline, ordered by offset | a themed list, grouped by tag | numbers, aggregated and diffed |
| #65 section | "Observations" | "Feedback themes" | "Metric changes" |
| Value type | prose | prose | `double precision` |

The shared surface is only `id`, `project_id`, `playtest_id`, `session_id`, `created_at` and (for
the two prose kinds) `tags` — five or six columns of parentage. Everything that makes each row
worth recording is disjoint. Merging them would make seven columns nullable-by-kind and require a
check constraint per kind to keep them honest, which is more schema than three plain tables, not
less.

The numeric one settles it independently: a `Metric` needs `value double precision NOT NULL` and
an index on `(playtest_id, metric_key)` so #65 can ask whether session duration moved between two
prototype versions. In a merged table that column is `NULL` for every prose row and the index is
mostly dead entries.

**Observation and Feedback are the near-miss** — they differ by three columns and are both prose —
and §8 records why they still stay apart.

---

## 5. Historical integrity: how the `PrototypeVersion` pin is enforced

This is #63's hardest constraint, and it is answered by a database constraint, not an intention.

### 5.1 The mechanism

`packages/database/src/schema/prototype-versions.ts` already declares the key that makes this
free:

```ts
unique('prototype_versions_id_project_id_key').on(table.id, table.projectId),
```

Its comment says it exists to "let the member rows carry a composite foreign key that pins them to
one project as well as one prototype version." A playtest is the second such member. So:

```ts
foreignKey({
  columns: [table.prototypeVersionId, table.projectId],
  foreignColumns: [prototypeVersions.id, prototypeVersions.projectId],
  name: 'playtests_prototype_version_fk',
}).onDelete('restrict'),
```

This is the same construction `prototype_entity_versions` uses against `entity_versions`, and it
buys three guarantees the services cannot bypass:

1. **A playtest of another project's version cannot be written at all** — the composite key
   requires the version's `project_id` to equal the playtest's.
2. **A version that was played cannot be deleted** — `RESTRICT`.
3. **Deleting a whole project still works**, because `playtests.project_id` cascades from
   `projects` and clears these rows before the versions they restrict. This is the diamond the
   repo already relies on and already tests: `packages/database/src/repositories/prototypes.integration.test.ts`,
   "still allows a whole project to be removed".

### 5.2 The pin is to the version, and nothing else is copied

The entity-version half of historical integrity is **inherited, not re-implemented**. A
`PrototypeVersion`'s `members` are immutable at capture — `annotatePrototypeVersion()` can change
only `status`, `notes` and `buildAssetId`, and `prototype_entity_versions` references
`entity_versions(id, entity_id, project_id)` `ON DELETE RESTRICT`. A playtest that resolves to a
version therefore transitively resolves to the exact `EntityVersion` rows that were played,
forever, with no snapshot of its own.

That directly satisfies #63's "Do not duplicate prototype/entity snapshots into the playtest
tables; reference immutable versions." There is nothing to duplicate: the guarantee already
exists one hop away.

### 5.3 No `prototype_id` column

`playtests` must **not** carry a `prototype_id`. It is derivable from
`prototype_versions.prototype_id`, and duplicating it is the entity-identity duplication the rule
forbids. "Every playtest of this prototype" is a join through `prototype_versions`, which is
indexed on `(prototype_id, version_number)` already.

### 5.4 The same construction, one level down

Each child row carries `project_id` (cascade from `projects`) plus a composite foreign key to its
parent, so parentage cannot cross a project and a note cannot be filed under a session belonging
to a different playtest:

- `playtest_sessions(id, playtest_id)` and `playtest_sessions(id, project_id)` get unique keys, as
  `playtests(id, project_id)` does, so the layer below can reference them compositely.
- Observations, feedback and metrics reference `(playtest_id, project_id)` `ON DELETE CASCADE`,
  and — when `session_id` is set — `(session_id, playtest_id)` `ON DELETE CASCADE`.

`session_id` is nullable on all three. #63 describes observations as tied to a session "where
useful", and a reviewer's feedback or a whole-playtest figure has no single run to belong to. One
rule for all three beats three different rules.

---

## 6. Where tags and categories live

**Verdict: free `text[]` tags on `playtests`, `playtest_observations` and `playtest_feedback`,
normalized by the existing `normalizeTags()` and indexed with GIN.** Not an enum, and not a
project-scoped vocabulary table.

`entities.tags` is already exactly this — a `text[]`, `NOT NULL`, defaulted to the empty array, with
`index('entities_tags_idx').using('gin', table.tags)` — and
`packages/domain/src/shared/validation.ts` already trims, de-duplicates and length-checks tags via
`normalizeTags()`. There is nothing to invent.

- **A fixed enum is disqualified by the requirement.** #63 says "without hardcoding one research
  methodology", and usability / difficulty / pacing / bug / delight / confusion is one
  methodology's vocabulary. As a `pgEnum` it would need a migration to add "accessibility".
- **A project-scoped vocabulary table is disqualified by YAGNI.** It is a table, a service, a
  repository, CRUD endpoints and a management UI, to solve a problem nobody has reported: tag
  drift. Nothing in #63, #64 or #65 asks to rename a category across existing rows. If that need
  arrives with real requirements, a vocabulary table can be added later *over* the same `text[]`
  column, which is not true in reverse.
- The six suggested words ship as a **suggestion list in the web feature** — an ordinary
  TypeScript constant offered in the tag input — so the common vocabulary is convenient without
  being enforced.

#65's "grouped/filterable by category without losing raw source text" is served directly: filter
with a GIN `&&` overlap, group with `unnest(tags)`, and the row's `body` is untouched prose.

Metrics get no tags — they have `metric_key`, which is the stronger identifier. Sessions get none:
nothing in #63 categorises a run.

---

## 7. Does `Metric` reuse `Parameter`?

**Verdict: yes for the id discipline and the units convention, no for the type.** A
`playtest_metrics` row does not contain a `Parameter`.

The temptation is real and the code even invites it. `packages/domain/src/parameter/parameter.ts`
says, in its own header:

> The shape is here, in the framework-free package, because mechanics are not the only thing that
> will hold one: prototypes and playtest records refer to the same parameters, and they refer to
> them by `id`.

Read precisely, that sentence licenses **referring to** a parameter by id. It does not say a
measurement is a parameter, and it should not, because half of `Parameter` is meaningless or
harmful for a measured outcome:

| `Parameter` field / function | On a measured metric |
| --- | --- |
| `min`, `max`, `step`, `options` | The control's affordances. A measurement has no slider. |
| `clampParameterValue()` | Actively wrong — you cannot clamp an observed number into range. |
| `parameterValueIssue()` | Reports "above the maximum" about reality. |
| `type: 'range' \| 'percentage' \| 'enum'` | A metric is a number with a unit. |

Also: a tuning parameter lives inside an entity's `data` under `TUNING_PARAMETERS_KEY` and is
versioned by the entity. A metric is a row in a playtest table. They are stored by different
machinery for good reasons.

**What is reused, concretely:**

1. **`parameterId(label, taken)`** mints `metric_key` from the metric's label — the same slug
   function, so a metric key is `completion-rate` or `session-duration`, readable and stable under
   renaming for exactly the reason its doc comment gives.
2. **The `units` convention** — `unit text` holding `s`, `%`, `m/s` — so `120 s → 90 s` renders
   the way `formatParameterValue()` renders a tuning value, and #65's two comparison sections read
   as one design.

`packages/domain/src/compare/parameter-differences.ts` is the model for metric diffing: match on
the stable key, report `added` / `removed` / `changed`, emit the shared `Difference` type from
`packages/domain/src/compare/difference.ts`. #65 gets a `metricDifferences()` alongside
`parameterDifferences()`, both producing `Difference[]`, and its "Design changes" and "Metric
changes" sections render from one component.

**Deliberately not added: a `parameter_id` column on `playtest_metrics`.** Correlating "the drain
multiplier moved 0.8 → 1.0" with "session duration moved 120 s → 90 s" is #65's whole job, and
#65 asks for the two as *separate* sections it can present side by side — it does not ask to
declare that one metric measures one parameter. Adding the column now would be guessing at a
relationship nobody has specified, and it would quietly invite the causal claim #65 explicitly
forbids ("Do not claim causation from correlation").

**Aggregation is computed, not stored.** #63 mentions "optional aggregation metadata". A metric
row is one measurement: per-session when `session_id` is set, playtest-level when it is not.
Mean/median/count across a playtest's sessions is a domain function over the rows, returned on
read. A stored aggregate goes stale the moment a session is added, and #63's own acceptance
criteria ask for tests on "session aggregation" — which is a function to test, not a column.

---

## 8. Rejected alternatives

### 8.1 `Playtest` as a 20th `ENTITY_TYPE` — the one that nearly won

The argument, and it is a good one:

- A playtest has a name, a status, a description, tags and a place in the project's story. That is
  the `Entity` surface, field for field.
- `ENTITY_TYPES` already contains `prototype` and `build`, which are no more "game content" than a
  playtest is. If the line were strictly "things inside the shipped game", neither would qualify.
- Being an entity is free infrastructure: `search_documents` indexes entities today
  (`SEARCH_SOURCE_TYPES = ['entity', 'asset', 'generation']`), `ContextResolver` feeds entities to
  AI, the activity feed knows `subject_type: 'entity'`, and `EntityRelationship` would let a
  playtest link to the mechanics it examined with no new columns. #63 asks for records "queryable
  for later comparison and AI analysis" and #65 wants to relate findings to entities — an entity
  gets both for nothing.
- The UX spec's Playtesting section lists "linked entities" as a capture field, which reads like a
  request for the entity graph.

**What defeats it:** the pin. A `Playtest` must name one exact `PrototypeVersion`, and inside an
entity that reference can only be a string in schemaless `data`. Every guarantee in §5 evaporates
— a playtest could name another project's version, and the version it named could be deleted out
from under it — and #63's single hardest constraint would become a service-layer convention that
any direct writer bypasses. That is precisely the trade `PrototypeVersion` already refused, in the
same corner of the domain, for the same reason.

Two further problems compound it: entities carry versioning, branching, promotion and restore,
which are meaningless-to-harmful on evidence; and `prototype` being an entity while
`PrototypeVersion` is a table means a `playtest` entity would sit at the wrong altitude anyway —
one level above the thing it is actually about.

The genuinely attractive part of this alternative — free search and AI context — is recoverable
later and cheaply: adding `'playtest_feedback'` to `SEARCH_SOURCE_TYPES` is an enum value and an
indexer branch, not an architecture. That is §10's follow-up, not a reason to misclassify the
record now.

### 8.2 One `playtest_records` table with a `kind` discriminator

Rejected in §4 on shared-column surface, and independently forbidden by the issue's "Five named
concepts with real fields beat one polymorphic table with a `kind` column and a JSONB blob."

### 8.3 Merging `Observation` and `Feedback` — the second-strongest

The argument: they are both a short piece of prose with tags, attached to a playtest and
optionally a session. They differ by `at_seconds`, `entity_id` and `observed_by` versus
`participant` and `sentiment`. One `playtest_notes` table with a two-value `source` enum
(`observer` | `participant`) would be a genuinely small, honest discriminator — nothing like §8.2's
polymorphic blob — and it would make "everything anyone said during this playtest" a single
ordered query.

**Why they stay apart:** the two have different *authorship semantics*, and that difference is
load-bearing rather than cosmetic. An observation is the team's interpretation; feedback is a
participant's own words. #65's rule — "Keep observed facts distinct from AI interpretation" — is
the same instinct one level down, and a `source` enum makes the distinction a filter that a
careless query drops, rather than a table a query has to name. The concrete cost of the split is
one extra `UNION ALL` in the one view that wants a merged timeline; the concrete cost of the merge
is a nullable `at_seconds` on participant rows and a nullable `sentiment` on observer rows,
forever, with a check constraint to stop them being set wrongly.

It is close, and if #64 finds it is writing that `UNION ALL` in four places, merging them is a
cheap later migration in a way that splitting a merged table is not.

---

## 9. Table sketch

Column types follow the repo's existing schema files. Every table carries `project_id uuid NOT
NULL REFERENCES projects(id) ON DELETE CASCADE` and leads its indexes with it, per
`packages/database/src/schema/entities.ts`.

### `playtests`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `project_id` | `uuid` NOT NULL | cascade from `projects` |
| `prototype_version_id` | `uuid` NOT NULL | composite FK with `project_id` → `prototype_versions(id, project_id)`, `RESTRICT` (§5.1) |
| `name` | `text` NOT NULL | |
| `goal` | `text` | short plain text, not TipTap JSON (§9.1) |
| `status` | `playtest_status` NOT NULL default `'planned'` | `planned \| running \| complete \| cancelled`, mirroring `GENERATION_STATUSES`' vocabulary for a thing that happens over time |
| `summary` | `text` | short plain text, written after the fact |
| `tags` | `text[]` NOT NULL default `'{}'` | GIN index |
| `created_by` | `text` | free text until authentication lands, as everywhere else |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | |

Keys: `unique(id, project_id)` so children can reference compositely; `index(project_id, created_at)`;
`index(prototype_version_id)`.

### `playtest_sessions`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `project_id` | `uuid` NOT NULL | |
| `playtest_id` | `uuid` NOT NULL | composite FK with `project_id`, `CASCADE` |
| `session_number` | `integer` NOT NULL | monotonic within the playtest, as `prototype_versions.version_number` is |
| `participant` | `text` | free text; a participant is not a user account |
| `notes` | `text` | |
| `started_at`, `ended_at` | `timestamptz` | both nullable: a session may be logged after the fact |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | |

Keys: `unique(playtest_id, session_number)` — the same racing-insert protection
`prototype_versions_prototype_number_key` gives; `unique(id, playtest_id)` and `unique(id, project_id)`
for the layer below; `index(project_id, playtest_id)`.

### `playtest_observations`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `project_id` | `uuid` NOT NULL | |
| `playtest_id` | `uuid` NOT NULL | composite FK with `project_id`, `CASCADE` |
| `session_id` | `uuid` | nullable; composite FK with `playtest_id`, `CASCADE` |
| `entity_id` | `uuid` | nullable; composite FK with `project_id` → `entities(id, project_id)`, `RESTRICT` (§9.2) |
| `at_seconds` | `integer` | offset into the session, where one is known |
| `body` | `text` NOT NULL | |
| `tags` | `text[]` NOT NULL default `'{}'` | GIN index |
| `observed_by` | `text` | |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | |

Keys: `index(project_id, playtest_id)`; `index(session_id, at_seconds)`; `index(entity_id)`.

### `playtest_feedback`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `project_id` | `uuid` NOT NULL | |
| `playtest_id` | `uuid` NOT NULL | composite FK with `project_id`, `CASCADE` |
| `session_id` | `uuid` | nullable; composite FK with `playtest_id`, `CASCADE` |
| `body` | `text` NOT NULL | the participant's words, stored verbatim |
| `sentiment` | `playtest_sentiment` | nullable `positive \| neutral \| negative`; a small enum, because it is a three-way judgment, not a vocabulary |
| `tags` | `text[]` NOT NULL default `'{}'` | GIN index |
| `author` | `text` | who said it, where known |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | |

Keys: `index(project_id, playtest_id)`; `index(session_id)`.

### `playtest_metrics`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `project_id` | `uuid` NOT NULL | |
| `playtest_id` | `uuid` NOT NULL | composite FK with `project_id`, `CASCADE` |
| `session_id` | `uuid` | nullable; set for a per-run measurement, null for a playtest-level figure |
| `metric_key` | `text` NOT NULL | minted by `parameterId()` (§7) |
| `label` | `text` NOT NULL | as entered; `metric_key` is the identity |
| `value` | `double precision` NOT NULL | |
| `unit` | `text` | `s`, `%`, `m/s`; same convention as `Parameter.units` |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | |

Keys: `unique(playtest_id, session_id, metric_key)` — one value per key per run; `index(playtest_id, metric_key)`
for #65's cross-version comparison.

> **Note for the implementer:** Postgres treats `NULL`s as distinct in a `UNIQUE` constraint, so
> playtest-level rows (`session_id IS NULL`) are not covered by that key. Declare it
> `UNIQUE NULLS NOT DISTINCT` — `infra/docker-compose.yml` runs `postgres:16-alpine`, so it is
> available, and drizzle exposes it as `.nullsNotDistinct()`.

### 9.1 Prose boundary

`goal`, `summary`, `notes` and `body` are plain `text`, like `prototype_versions.notes` and
`activities.summary` — **not** TipTap JSON. `CLAUDE.md`'s "all rich text goes through
`RichTextEditor`" applies to long-form documents, and the repo has already placed the long-form
case: `README.md` says "A GDD, a brief and a playtest write-up are all `document` entities", and
`DOCUMENT_VERSION_REASONS` contains `'playtest'`. A playtest *write-up* stays a `document` entity;
these fields are the short, structured capture a form produces.

Nothing links a write-up document to a playtest yet, and nothing in #63 asks for it. If #64 wants
that, it adds one nullable entity reference then.

#63's "Do not fold freeform feedback into one opaque text blob" is satisfied by one row per
remark, each with its own tags, author, session and sentiment — not by making each remark a rich
document.

### 9.2 The one entity link, and why it is not an `EntityRelationship`

An observation may narrow itself to one entity ("the diver got stuck at the trench"). That cannot
be an `EntityRelationship`: both endpoints of an edge are entities, and a playtest observation is
not one. A single nullable `entity_id` with a composite foreign key to `(id, project_id)` and
`ON DELETE RESTRICT` is the right shape — one column, project-scoped by the database, and no
second graph, exactly the boundary `generation.ts` draws.

Feedback does not get one. #63 describes feedback as participant prose and #65 groups it by theme,
not by entity; nothing asks a feedback row to point at an entity.

"Which entities did this playtest cover?" is not a new link at all — it is the tested
`PrototypeVersion`'s pinned members, already available through §5.2.

---

## 10. Follow-ups this decision creates

Each is mechanical, and each belongs to #63 or later rather than here:

- **Search.** `SEARCH_SOURCE_TYPES` is `['entity', 'asset', 'generation']`. Making feedback and
  observations findable means adding a source type and an indexer branch. #63 should decide
  whether that is in scope; the `tags` GIN index and `(project_id, playtest_id)` serve #65's
  filtering without it.
- **Activity feed.** `ACTIVITY_TYPES` and `ACTIVITY_SUBJECT_TYPES` have no playtest members. A
  `playtest_completed` type with `subject_type: 'playtest'` is a natural addition, following the
  precedent that `subject_id` carries no foreign key.
- **Domain layout.** `packages/domain/src/playtest/` mirroring `prototype/`: one file per concept,
  plus `playtest-repository.ts` (the port) and `playtest-service.ts`, with the Postgres adapter in
  `packages/database/src/repositories`.
- **`docs/README.md`** indexes `docs/decisions/`. It needs a line for this document; it is not
  edited here because several decision documents are being written in parallel and the index is
  the one file they would all collide on.
