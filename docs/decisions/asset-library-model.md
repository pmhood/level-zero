# The asset library model: collections, tags, pipeline state and versions

Decided for issue #177, which split out of the Asset Library epic #166. It unblocks #178
(collections) and #179 (the production pipeline), and removes the placeholders #171 and #173 were
told to leave alone.

Everything below was read against the code on **2026-09-11**, at `991a575`. Where a file is named,
it is named because the answer turns on what is actually in it.

This document decides a model. It changes no code.

---

## 0. The four answers

| Question                  | Answer                                                                                                                                              | New tables |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **1. Collections**        | A 20th `ENTITY_TYPE`, `asset_collection`. Membership is an ordinary `contains` `EntityRelationship` to the asset's `asset_reference` entity.        | none       |
| **2. Tags on assets**     | A `tags text[]` column on `assets`, mirroring `entities.tags` exactly — not the `asset_reference` entity's tags.                                    | none       |
| **3. Pipeline state**     | A new, project-wide, single-valued `pipeline_stage` on `assets`, orthogonal to `AssetSelection` and `AssetMark`. Transitions recorded as `Activity`. | none       |
| **4. Versions**           | **Not yet.** The mockup's `v2.1` is lineage drawn as a version number. §7.4 says what would change that.                                            | none       |

Four questions, four answers, no new tables. That is not a target anybody set; it is what falls out
of applying the test in §3 honestly, and it is the strongest single piece of evidence that the
answers are right.

---

## 1. Why this exists

`docs/mockups/asset-library.png` shows a Collections rail, tags on every card, one status pill per
asset, and a `v2.1` next to a Versions tab and a Compare Versions button. The model holds none of
those. Each is a modelling decision rather than a UI build, and each has at least two plausible
answers inside this architecture — which is exactly the situation where two implementers guess
differently and the guesses do not compose.

The repo's rule is explicit about the first one (`CLAUDE.md`):

> **Before adding a table for a new kind of game object, check whether it is an `Entity` type and
> whether the link you want is an `EntityRelationship`.** [...] Duplicating entity identity in a
> feature-specific store is the exact thing this architecture exists to prevent — it is the
> difference between a connected workspace and a pile of independent generators.

So the question is not "what would I design" but "what does this repo already say", and §3 is the
form the repo has already put that in.

---

## 2. What the mockup is evidence of

#177 settles that the mockup is evidence of intent, not a specification of the model. Read closely,
it is better evidence than that framing suggests — two of its own numbers decide two of the four
questions outright — and worse in two places, which §2.2 and §2.3 say so about.

### 2.1 The two numbers

The Collections rail reads Environment 128, Characters 64, Props & Gear 92, Vehicles 48, UI & HUD
36, Audio 28, VFX 41. That sums to **437**. The grid heading beside it reads **All Assets (342)**.

Collections overlap. The mockup says so arithmetically, in the mockup, independently of #166's rule
that "the same Asset must remain reusable across multiple entities and workspaces". An asset is in
one collection, or three, or none. Any design in which a collection owns its assets is contradicted
by the picture it was drawn from.

The Asset Pipeline strip reads Concept 48 → Approved Concept 32 → Modeling 67 → Texturing 54 → Rig /
Animation 28 → Engine Ready 113. That sums to **342** — the same number as the whole library, exactly.

The pipeline is a **partition**: every asset is in exactly one stage, and nothing is outside it.
That is the opposite property from collections, from the same picture, and it is what #179's
acceptance criterion ("Every asset has a pipeline stage, including ones that existed before the
migration") independently asks for.

Two things that look alike on the page — a rail of counted buckets and a strip of counted buckets —
are different in the only way that matters to a model. Collections are a many-to-many labelling;
the pipeline is a total function from asset to stage.

### 2.2 The status pill is three facts in one slot

The pills on the cards are Reference, Generated, In Progress, Approved and Production Ready; the
UX spec's own list (`docs/design/page-by-page-ux-spec.md`, Assets → States) is Reference, Generated,
Selected, Approved, Production Ready. Neither is one vocabulary. Taken one at a time, against the
code:

| Pill                | What it actually is         | Where it already lives                                                        |
| ------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| **Reference**       | a *kind* of file            | `ASSET_KINDS` already contains `'reference'` (`packages/domain/src/asset/asset.ts`) |
| **Generated**       | an *origin*                 | derived from `generations.output_asset_ids`; #170 states it is derived, never stored |
| **Selected / Approved** | a *contextual decision* | `AssetSelection`, per `(entityId, purpose)` (`packages/domain/src/selection/asset-selection.ts`) |
| **In Progress**     | production state            | **nothing**                                                                   |
| **Production Ready**| production state            | **nothing**                                                                   |

Three of the five already exist as three different kinds of fact. Only the last two are new, and
they are the same new thing at two points along it.

So the single pill is a *rendering* decision — one badge slot, filled by precedence from three
separate facts — not a model. §6.5 fixes that precedence so #171 and #173 do not each invent one.
Design spec §19 is compatible: its `Status` union is a badge vocabulary for a component, and it
already mixes `draft`, `generated` and `approved` the same way, which is fine in a badge and wrong
in a column.

### 2.3 The pipeline strip is a 3D-art pipeline applied to every file

Modeling, Texturing and Rig / Animation are stages in making a 3D character. The strip applies them
to all 342 assets, which includes the 28 in the Audio collection and the 36 in UI & HUD. There is no
texturing stage for a sonar ping, and the mockup's own cards prove it: `Sonar Ping Loop` is an Audio
asset badged Reference, and `Kael Run Cycle` is an Animation badged In Progress.

**Recommend against the mockup here.** The stage list must be kind-agnostic or it is false for most
of the library. §6.3 proposes three stages that are true for a texture, a track and a HUD sprite
alike, and keeps the funnel the caption promises ("Track assets from concept to engine ready").

"Approved Concept" is the second thing to reject: it folds a decision into the stage ladder, which
is precisely what #179 forbids ("A pipeline stage is not a second review state").

### 2.4 Two smaller contradictions, noted once

- The inspector's **Collection** field is singular ("Collection: Characters"). §2.1 already showed
  membership is many-to-many. #178 should render a list. This is a label in a mockup losing to a
  sum in the same mockup.
- Design spec §38 puts **Asset Pipeline** under the *Build* workspace, while the mockup puts the
  strip in *Assets*. Both are right and it is an argument for the model in §6: the stage is a
  project-wide property of the file, so Assets and Build are two views over one column rather than
  two features with two stores.

---

## 3. The test this repo already applies

`docs/decisions/playtest-record-model.md` §2.3 states the entity-versus-table line, derived from the
code rather than from principle. It is reproduced here because three of the four questions below
are decided by it:

| A thing is an `Entity` when                             | A thing gets its own table when                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| It is part of the game being designed                   | It is evidence, provenance or bookkeeping *about* the game             |
| Versioning, branching, promotion and restore make sense | Those operations are meaningless or actively wrong for it              |
| Its fields fit identity + tags + schemaless `data`      | It needs a column the database must constrain (a foreign key, a check) |
| A tool should be a *view* over it                       | It is written once by one workflow and read by others                  |

The worked example that matters most here is the one that document names: **`moodboard` is an
`Entity`, `moodboard_nodes` is a table.** A board is a named, human-authored grouping of assets, so
the board is an entity; what an entity cannot hold is the per-board *geometry* — x, y, rotation,
z-order, group, lock — so that gets a table, and it holds no identity of its own.

Keep that example in view for §4. A collection is a moodboard with the geometry removed.

---

## 4. Collections — an `asset_collection` entity, membership as `contains`

**Recommendation: add `asset_collection` to `ENTITY_TYPES`. A collection is an ordinary `Entity`.
Membership is an ordinary `EntityRelationship` with relation `contains`, from the collection entity
to the asset's `asset_reference` entity. No new table, no new relation type, no join table.**

### 4.1 Applying the test

- **Part of the game being designed?** Yes, in the same sense a moodboard is. "Props & Gear" and
  "UI & HUD" are how a team divides its own art direction; they carry a name, a description and a
  cover, they are worth searching, and they are worth linking to a character or a region. They are
  not bookkeeping *about* the project the way a `Generation` or a `Playtest` is — nobody generates
  a collection as a side effect of an act.
- **Do versioning, branching and restore make sense?** Weakly, and that is the one row where the
  answer is unenthusiastic rather than affirmative. Nothing here needs `EntityVersion`, and #178
  should not wire one up. But the same is true of `moodboard`: versioning a board's entity row does
  not version its node layout either, and that did not make a board a table. This row does not
  decide.
- **Do its fields fit identity + tags + `data`?** Yes, entirely. Name, description, status, tags —
  all of them are already on `Entity`. There is no field left over needing a constraint the
  database must hold, which is the exact condition that forced `moodboard_nodes`, `playtests` and
  `prototype_versions` into tables of their own. A collection has no geometry.
- **Should a tool be a view over it?** Yes, three of them: the rail, the Collections view in the
  switcher, and the toolbar's collection filter. All three are views over one thing, which is the
  sentence `entity-type.ts` opens with.

Three affirmative rows and one that abstains. Nothing points at a table.

### 4.2 The membership edge is the mechanism `asset-reference.ts` exists to provide

`packages/domain/src/asset/asset-reference.ts` says what it is for in its own header:

> a link like this needs no schema, and no `assetId` column, of its own [...] This is the whole
> mechanism the issue asks for — no separate `character_images` or `moodboard_images` table.

`asset_collections_assets` would be the next entry in that list of tables the mechanism exists to
avoid.

Two properties of the existing schema make the edge the better artefact rather than merely the
allowed one:

- **`entity_relationships_edge_key`** is unique on `(source_entity_id, target_entity_id, relation)`
  (`packages/database/src/schema/entity-relationships.ts`). Adding the same asset to the same
  collection twice is impossible at the database level, with no code and no new constraint. A hand-
  rolled membership table would have to reinvent that unique key.
- **Both endpoints are composite `(entity_id, project_id)` foreign keys, `ON DELETE RESTRICT`.** A
  collection in one project cannot contain another project's asset — not by convention but because
  the row cannot be written. `asset_selections` had to settle for a single-column reference to
  `assets` precisely because `assets` has no `(id, project_id)` key; routing membership through
  `asset_reference` gets the stronger guarantee for free.

`contains` is already in `RELATION_TYPES` and already reads source-first ("collection contains
asset reference"). It is a structural relation, not a lineage one, so it is freely removable —
which is exactly right for a membership that a user adds and takes away.

### 4.3 The shape, concretely

What #178 implements:

- **`packages/domain/src/entity/entity-type.ts`** — `'asset_collection'` added to `ENTITY_TYPES`.
  One generated migration, `ALTER TYPE "public"."entity_type" ADD VALUE 'asset_collection';` —
  the same shape as `0016_wet_king_bedlam.sql` and `0018_nice_scarecrow.sql`. Run `pnpm db:generate`;
  never a schema push.
- **No schema change beyond that enum value.** No new table in `packages/database/src/schema`.
- **`AssetCollectionService`** in `packages/domain/src/asset/`, composing `EntityService` and
  `EntityRelationshipService`:
  - `create(projectId, { name, description, tags })` → `EntityService.create` with type
    `asset_collection`.
  - `addAsset(projectId, collectionId, assetId)` → `EntityService.findOrCreateAssetReference`
    (atomic, one reference entity per asset per project) then
    `EntityRelationshipService.create(collectionId → referenceId, 'contains')`.
  - `removeAsset(...)` → delete the edge. The asset, its bytes and its reference entity are
    untouched, satisfying #178's "Removing an asset from a collection removes the membership,
    never the asset."
  - `rename`, and delete-as-archive (see §4.6).
  - The service is the thing that keeps `contains` edges from a collection pointing at anything but
    an `asset_reference`; nothing else needs to enforce it, because nothing else writes them.
- **Counts and filtering** go on the read-model port #170 introduces, not on `EntityRelationship-
  Repository`. Seven rail counts must not be seven `listForEntity` calls, and #178 requires the
  collection filter to narrow server-side and be reflected in `total`. Both are one query:

  ```sql
  -- rail counts: one grouped read, archived assets excluded
  select r.source_entity_id, count(*)
    from entity_relationships r
    join entities ref on ref.id = r.target_entity_id and ref.project_id = r.project_id
    join assets a on a.id = (ref.data->>'assetId')::uuid
   where r.project_id = $1
     and r.relation = 'contains'
     and ref.type = 'asset_reference'
     and a.status = 'active'
   group by r.source_entity_id;
  ```

  `entity_relationships_target_idx`, `entity_relationships_source_idx` and
  `entities_asset_reference_asset_id_key` all already exist and all point the right way.
- **API**: a NestJS module under `apps/api/src/assets/` (or its own `asset-collections/`), wired
  through `apps/api/src/domain/domain.module.ts`. The listing's collection filter is a new field on
  #170's filter, alongside `origin`, `markKinds`, `selectionStates` and `linkedEntityId`.
- **The cover is derived**, per #178: the newest active member asset by the edge's `createdAt`. No
  column, no upload, no `data.coverAssetId`.

### 4.4 What this gets for free, and it is not a small list

Because a collection is an entity: it is searchable the moment it exists
(`searchDocumentForEntity`); it appears in the command palette (#68); it can be tagged; it can be
related to a character or a region with an ordinary `references` edge, so "the art for Kael" is
expressible without anybody building it; it is archived rather than deleted like everything else;
it records activity through the path `EntityService` already records it on; and it gets canonical
routing (`docs/decisions/canonical-entity-routes.md`) with no routing decision at all.

None of that is a reason on its own — free features are how over-design justifies itself — but the
alternative in §4.5 has to either give all of it up or rebuild the parts it wants.

### 4.5 Alternatives considered

**(a) Two tables of its own: `asset_collections` + `asset_collection_assets`.** The obvious shape,
and the one #178 would otherwise land on. It has one genuine advantage — §4.6 — and otherwise loses
on every row of §3's test: a collection needs no constrained column an entity cannot hold, three
tools want to be views over it, and "a name, a description and a set of members" is the definition
of what `entities` + `entity_relationships` is for. It would also put a second membership graph
beside the entity graph, which is the thing `generation.ts` names when it says its id lists "never
become a second, parallel graph."

**(b) A collection is just a tag.** Tempting once §5 gives assets tags: "Environment" is a tag, the
rail is the top seven tags by count. Rejected because a collection has properties a tag cannot
carry — a description, a cover, its own identity that survives a rename, the ability to be linked
to a character — and because design spec §20 draws the line for us: "Tags communicate taxonomy, not
status", and a rail of seven curated buckets with covers is neither. Collapsing the two would also
make every tag a collection, which is not what a 342-asset library wants above its grid.

**(c) A `collection_ids uuid[]` column on `assets`.** Cheapest to query, and wrong: it puts a
foreign key in an array with no referential integrity, no project scoping, and no way for the
database to refuse a cross-project membership. It also contradicts the `Asset` header comment
directly — "carries no feature-specific foreign keys".

### 4.6 The strongest argument against

**It materialises an `asset_reference` entity for every asset anybody files.**

Today those entities are created lazily, on first link, by `findOrCreateAssetReference`. A library
where filing an image into "Environment" creates one means a project with 342 assets and a habit of
tidying ends up with 342 `asset_reference` entities. They are indexed as entity search documents
(`searchDocumentForEntity`, called for every type), they appear in generic entity listings, and
they will appear in the command palette. A search for "Kael" would then return the asset document
*and* the reference entity document for the same file.

Three things make this acceptable rather than fatal, and one of them is a genuine caveat:

1. **It is one entity per asset per project, not one per membership.** The unique index
   `entities_asset_reference_asset_id_key` guarantees it, and `findOrCreateAssetReference` is atomic
   against it rather than check-then-insert. Filing one asset into five collections creates one
   entity and five edges.
2. **This is what the mechanism is for.** Character Studio, Moodboard and the GDD already create
   these on link. Collections linking assets is the same act.
3. **The duplicate-hit problem already exists** for every asset a character or a board has ever
   used. Collections make it more visible; they do not create it. Whether `asset_reference` entities
   should be filtered out of generic entity search and the command palette is a real question and
   it is *not this document's* — it is listed as a follow-up in §9.

If somebody later decides `asset_reference` entities must stay rare, that is the argument that
overturns §4, and (a) is what it overturns it to.

---

## 5. Tags on assets — a column on `assets`

**Recommendation: `tags text[] not null default '{}'` on `assets`, GIN-indexed, normalised by the
existing `normalizeTags`. Not the `asset_reference` entity's tags.**

### 5.1 The question's premise, corrected

#177 asks: "does the `asset_reference` entity's tags serve — and what then are the tags of an asset
referenced three times?"

They are one set, because **an asset is never referenced three times.**
`entities_asset_reference_asset_id_key` is a partial unique index on
`(project_id, (data->>'assetId'))  where type = 'asset_reference'`, and `EntityService.find-
OrCreateAssetReference` is written against it. An asset used by a character, a board and the GDD has
exactly one reference entity and three relationships from it.

So the alternative is genuinely available, and it loses on other grounds.

### 5.2 Why the column wins anyway

1. **Tagging must not create entities.** Typing `scifi` into the inspector would call
   `findOrCreateAssetReference` and materialise a reference entity that nothing links to — all of
   §4.6's cost, with none of §4.6's justification, because a tag is not a link between two things.
   §4 pays that cost for membership, which genuinely is one. Paying it twice for a string is not
   the same trade.
2. **The search index cannot reach them.** `searchDocumentForAsset(asset, deps)` takes the asset
   and nothing else, and hands `tags: []` (`packages/domain/src/search/search-document.ts`). Tags
   on the reference entity mean either changing that signature and doing an entity lookup on every
   `assetChanged`, or accepting that an asset's tags are only searchable through the *entity*
   document — which returns the same file twice for one query, under two titles. With a column it
   is one line: `tags: [...asset.tags]`, and `SearchFilter.tags` (#41) then filters assets and
   entities alike, which is what that filter's comment already promises.
3. **The library's own filter is server-side.** #172 requires every filter to narrow in SQL and be
   reflected in `total`. That is a predicate on `assets.tags` versus a join through
   `entities` on a JSONB expression for every tile.
4. **Tags are description, not identity.** The architecture rule forbids re-expressing entity
   *identity* in a feature store. `Asset` already carries filename, MIME type, dimensions and
   duration — its own description of itself. A tag belongs in that list, and design spec §20 agrees
   about what a tag is: "taxonomy, not status."

### 5.3 The shape, concretely

- **`packages/domain/src/asset/asset.ts`** — `tags: string[]` on `Asset`, `tags?: string[]` on
  `CreateAssetInput`, `normalizeTags(input.tags)` in `createAsset`. `normalizeTags` and
  `MAX_TAG_LENGTH` (50) already exist in `packages/domain/src/shared/validation.ts` and are what
  `createEntity` uses; use them unchanged so an asset tag and an entity tag are the same thing.
- **`packages/database/src/schema/assets.ts`** — a `tags` text array, `notNull`, defaulting to
  `'{}'::text[]`, plus `index('assets_tags_idx').using('gin', table.tags)` — copying the four lines
  `entities.tags` already occupies. Existing rows take the default; no backfill.
- **`AssetService.setTags(projectId, assetId, tags)`**, ending in the existing `this.indexed(...)`
  so the search document follows the row, exactly as `upload`, `archive` and `restore` do.
- **`AssetListFilter.tags?: readonly string[]`**, matching *any* of the given tags
  case-insensitively — the same contract and the same wording `EntityListFilter.tags` has.
  `packages/database/src/repositories/entity-repository.ts` has the predicate to copy.
- **`searchDocumentForAsset`** — `tags: [...asset.tags]`, and the tags joined into `body`, which is
  what `searchDocumentForEntity` already does.

The `asset_reference` entity keeps its own `tags` field and the library never writes it. It is the
link's tags; in practice nothing sets it, and nothing should start syncing the two.

### 5.4 Alternatives considered

**(a) Tags on the `asset_reference` entity.** §5.2. It is not absurd — it is the answer that adds
literally nothing to the schema — and if `searchDocumentForAsset` did not exist it might win.

**(b) A `tags` table with a join table.** Gives tag rename, per-tag colour, and an autocomplete
source with exact counts. Rejected as premature: `entities.tags` is a `text[]` and has been enough
for every entity type in the project, and matching the neighbour is worth more than the features
nobody has asked for. If tag management becomes a real feature it should arrive for entities and
assets together, not for assets alone.

### 5.5 The strongest argument against

**Two tag vocabularies now exist for one project**, `entities.tags` and `assets.tags`, with nothing
keeping them coherent. Somebody tags a character `sci-fi` and its concept art `scifi`, and no
autocomplete spans both.

That is real, and it is an argument for a shared tag vocabulary later rather than against the column
now — the join-table design in (b) would have exactly the same problem until the day it is applied
to entities too. The mitigation available today is cheap and belongs to #172: source the tag
autocomplete from both `assets.tags` and `entities.tags` in one query.

---

## 6. Pipeline state — a new, project-wide stage, orthogonal to the decisions

**Recommendation: a fourth axis. `pipeline_stage` on `assets`, `not null default 'concept'`,
project-wide and single-valued. It neither derives from nor constrains `AssetSelection` or
`AssetMark`. Each transition is recorded as an `Activity`, not in a table of its own.**

### 6.1 The tension, head-on

#177 asks whether a project-wide pipeline state exists alongside the contextual decisions and what
its relationship to them is. The honest answer is that the library has **four** independent
questions about a file, and the mockup's one pill is why they look like one:

| Axis                 | The question it answers                     | Shape                                                | Where                              |
| -------------------- | ------------------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| **Lifecycle**        | Is this file still in play at all?          | one value per asset                                  | `assets.status` (`active`/`archived`) |
| **Triage**           | Did somebody set this aside to come back to? | a set, project-scoped, freely added and removed      | `AssetMark` (`favorite`, `shortlisted`) |
| **Decision**         | Is this the right one *for X*?              | one current state per `(entityId, purpose)`, append-only | `AssetSelection`                 |
| **Production stage** | How finished is this file?                  | one value per asset, project-wide                    | **new**                            |

The tension is not that decision and stage disagree. It is that they answer different questions and
the mockup gives them one badge. **An asset approved for one character and rejected for another has
no single decision state — and it does not need one, because it has exactly one production stage.**

- *Kael Salvage Suit* is the approved portrait for Kael Voss and rejected costume exploration for
  someone else. Both are true. Neither is its stage.
- The same file is either finished production art or it is not, and that is true regardless of who
  is using it or whether anyone is.

Flattening either into the other loses information in a direction somebody will notice:

- **Deriving the stage from selections** — "approved somewhere ⇒ production ready" — is false in
  both directions. A concept sketch can be the approved reference for a character while the
  production model is still being textured (mockup: `Corroded Hull Material` is Generated at v2.0,
  `Kael Run Cycle` is In Progress at v0.6). And a HUD sprite can be finished, shipped and used by
  nothing that has an `(entity, purpose)` context at all.
- **Deriving selections from the stage** would make "Production Ready" a project-wide approval,
  which is exactly what #173 forbids ("The inspector must ask — `PurposePicker` is the existing
  affordance — rather than inventing a project-wide approval").

So: **orthogonal, with no derivation and no coupling in either direction.** "Approved" is contextual
and stays contextual; "Production Ready" is project-wide and means the file is finished, not that
anyone has chosen it. A file can be finished and chosen for nothing; a file can be chosen and
unfinished. Both sentences must stay sayable, and the model above is the smallest one in which they
are.

One coupling was considered and rejected: **requiring at least one current `approved` selection
before an asset may enter the final stage.** It is attractive — it would stop the stage becoming a
second, uncoupled approval system, which is #179's stated fear — and it is rejected because it makes
an asset with no entity context unpromotable. The mockup's own `Inventory HUD Kit` is that asset. A
rule that cannot express the picture that motivated it is the wrong rule, and the guard it buys is
one the UI can offer as a warning instead of the service enforcing as a constraint.

### 6.2 It cannot be derived, so it is stored

Nothing in `assets`, `asset_marks`, `asset_selections`, `generations` or `entity_relationships`
implies that a texture has been authored, or that a model has been rigged. The stage is new
information a person supplies. #170's rule that `origin` is derived and never stored does not extend
to it; origin is a fact about what already happened, and the stage is a claim about work.

### 6.3 The stages

**`concept` → `in_progress` → `production_ready`.** Three, fixed, kind-agnostic, ordered for display
and for "advance" being one click; any stage may move to any other, because a production-ready asset
sent back for rework is an ordinary event.

The derivation, from §2.2 and §2.3, after removing what is already modelled:

- The card pills contribute **In Progress** and **Production Ready**; every other pill is a kind,
  an origin or a decision.
- The strip contributes a start (**Concept**) and an end (**Engine Ready**, the same stage as
  Production Ready under a Build-workspace name).
- The strip's **Modeling / Texturing / Rig / Animation** are dropped: §2.3. They are one medium's
  specialisation of `in_progress` and they are false for the audio, UI and texture assets the same
  strip counts.
- The strip's **Approved Concept** is dropped: it is the decision axis, and #179 rules it out.

`concept` is the mockup's own word and is the right default: it is where an upload, a generation
result and a reference all legitimately start. It reads oddly for the `export` and `build_artifact`
kinds, where the pipeline means nothing — those sit in `concept` forever and nobody looks. That is
a cost of the partition being total, and the partition is total because #179 asks for it.

Per-project custom stages are explicitly out of scope (#179) and the three-stage list is chosen so
that adding a fourth later is an enum value, not a re-modelling.

### 6.4 Where the current value lives, and where the history does

The current stage is a **column on `assets`**. Every read in the library needs it: a badge on every
tile, a count per stage across the whole project, and a server-side filter reflected in `total`.
Folding an append-only history to answer a partition count is the wrong instrument.

The repo's precedent for exactly this shape is `entities.current_version_id` beside
`entity_versions`: an authoritative pointer on the row, with the immutable history in its own
append-only place. `asset_selections` looks different only because it has no current column — the
history *is* the source of truth there, which is why it needs foreign keys and check constraints.

**The history is an `Activity`.** #179 asks for "a recorded act, not a toggle", and the repo already
has the table for recorded acts. `packages/domain/src/activity/activity.ts` even anticipates this:

> An activity type is added when a domain service reaches a state a person would recognise later
> [...] All are additions for whoever builds them, not types to guess the shape of now.

So #179 adds:

- `'asset_stage_changed'` to `ACTIVITY_TYPES`, and `'asset'` to `ACTIVITY_SUBJECT_TYPES`.
- One migration, two `ALTER TYPE ... ADD VALUE` lines plus the `asset_pipeline_stage` enum and the
  column — the same shape as `0016_wet_king_bedlam.sql`, which added an activity type and subject
  type together for playtests.
- `AssetService.setPipelineStage(projectId, assetId, stage, { actor, note })`: validate the stage,
  write the column, record the activity with `metadata: { from, to }`, re-index. Not a bare column
  write from a controller.

Why not a dedicated `asset_stage_transitions` table: its only reader would be one tab, and
`activities` already carries actor, timestamp, a durable precomputed summary and structured
metadata, indexed by `(project_id, subject_id)` for exactly this read — "A contextual workspace
reads activity about one subject." Stage changes also belong in the project feed on their own
merits, which a private table would not give. `activities.subject_id` deliberately carries no
foreign key, and that is acceptable *here precisely because the column is authoritative*: the
activity is narrative about a fact stored with integrity elsewhere, which is not the situation
`asset_selections` is in.

What would change that: a requirement to query transitions as data — "everything that entered
`in_progress` last week", throughput between stages, time-in-stage. That is a reporting feature, it
does not exist, and it is when the table earns its place.

### 6.5 The single pill

So that #171 and #173 do not each invent one, the card's one badge slot is filled by the **first**
of these that applies:

| # | Condition                                                      | Badge            | Source                                  |
| - | -------------------------------------------------------------- | ---------------- | --------------------------------------- |
| 1 | `status = 'archived'`                                          | Archived         | `assets.status`                         |
| 2 | `pipelineStage = 'production_ready'`                            | Production Ready | new column                              |
| 3 | a current `approved` selection in **any** context               | Approved         | #170's summary; `currentAssetSelections` |
| 4 | `pipelineStage = 'in_progress'`                                 | In Progress      | new column                              |
| 5 | `origin = 'generated'`                                          | Generated        | #170's summary, derived                 |
| 6 | `kind = 'reference'`                                            | Reference        | `ASSET_KINDS`                           |
| 7 | otherwise                                                       | Concept          | new column                              |

That reproduces every pill in the mockup from facts that exist, with one new field. Two notes for
whoever builds it: a badge is a summary and the inspector is not — the inspector shows the axes
separately, which the mockup already does (a Status row *and* a per-context history) — and #170's
rule holds, that "approved project-wide" means approved in at least one context and the contexts
come back with it.

### 6.6 Alternatives considered

**(a) Derive the stage from selections and marks.** §6.1. It is the only answer that adds nothing,
and it cannot express a finished asset nobody has chosen or an approved sketch nobody has modelled.

**(b) Widen `ASSET_STATUSES` from `active`/`archived` to include the stages.** Rejected: it
conflates lifecycle with production state, so archiving a production-ready asset would forget its
stage, and every existing `status = 'active'` predicate — including `searchDocumentForAsset`'s and
the default in `AssetListFilter` — would silently change meaning.

**(c) An append-only `asset_stage_transitions` table with the current stage folded on read.** The
most faithful reading of #179's "recorded act", and rejected in §6.4 on cost: a grouped count over
a folded history, per stage, per library page load, for a value that is single-valued by
construction.

**(d) The mockup's six stages as given.** Rejected in §2.3.

### 6.7 The strongest argument against

**A fourth axis is a fourth thing a user has to hold in their head**, and this document adds it on
the evidence of one mockup strip and two badge labels. Three axes already exist and #71 was recent.
If the team's real answer is "an asset is production-ready when somebody approved it and we do not
track modelling", then §6 invents a workflow the product does not have — and the `export` and
`build_artifact` kinds sitting permanently in `concept` is the visible edge of that.

The counter is #179's own framing: the strip is the second half of #166's triage workflow *at
project scale* — not "which of these thirty images" but "how much of the art is finished" — and
that question has no answer today, in any table. But if #179 is built and the stage never moves off
`concept` in real use, the column is the thing to delete, and this section is the record of why it
was added.

---

## 7. Versions — not yet, and the `v2.1` is lineage drawn as a number

**Recommendation: assets do not version. No `asset_versions` table, no version column, no version
number in the UI. The mockup's `v2.1` has nothing behind it, and the minor component in particular
is invented. #173 was right to defer the Versions tab; it should stay deferred.**

### 7.1 An asset's content is immutable, so a "version" is another row

An `Asset` row is a file: `storageKey`, `checksum`, `byteSize`, `mimeType`, `width`, `height`.
Nothing in `AssetService` rewrites the bytes behind a key, and `checksum` would be a lie if anything
did. So "v2 of this asset" is necessarily a *different asset row*.

That single fact rules out the `EntityVersion` shape outright. `EntityVersion` exists because an
entity's content is mutable in place, so history has to be snapshotted before it is overwritten
(`EntitySnapshot` is "the part of an entity that is *creative content* rather than identity"). An
asset is never overwritten, so there is nothing to snapshot — the older bytes are already sitting in
their own row, with their own checksum, permanently. A snapshot table here would store a second copy
of a row that cannot change.

What is left is a **chain between asset rows**, and the repo already has the vocabulary for one.

### 7.2 What the three existing lineages actually mean

| Mechanism              | What it means                                        | Why it is not a version chain                                                 |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| `assets.source_asset_id` | thumbnail / preview derived from a source           | constrained by `assets_variant_source_consistency`: a `source` asset may not have one at all, so it cannot express "v2 of" |
| `generations.parent_generation_id` | a re-roll of a generation                 | re-rolls are **siblings** — four takes on one prompt — not succession          |
| `EntityVersion`        | snapshots of mutable entity content                  | §7.1                                                                           |

The mockup conflates the middle one with versioning. Its versioned cards are the generated ones,
each with a prompt, a model and a References strip of four inputs; `v2.1` next to `dall-e-3` is a
picture of re-roll depth wearing a software version number. Four takes on a prompt are four
candidates to choose between — which is what `AssetMark` and `AssetSelection` are *for* — not
v1 through v4 of one thing.

### 7.3 "Compare Versions" compares nothing new

`assetDifferences(from, to)` (`packages/domain/src/compare/asset-differences.ts`) already takes two
assets plus their generations and reports kind, format, dimensions, file size, variant, status,
prompt, model, provider and seed, in two groups. Its own header says what it is for: "Two variants
of the same portrait usually differ in one line of prompt, and that is the line worth reading."

That *is* Compare Versions. There is nothing a version chain would add to the comparison itself —
only a **picker** that pre-selects the two sides. Today the picker would be populated from
`sourceAssetId` derivatives and `parentGenerationId` re-rolls, which is precisely what #173 already
puts in the inspector's History tab. So the button in the mockup is buildable now, against
`CompareView` + `assetDifferences`, with no model change — and it should be built that way rather
than waiting for a chain.

### 7.4 What would change the answer

One thing: **a "replace this file with a new take" action existing.** The UX spec lists it
(`replace asset`, under Project-changing actions requiring preview/confirm); nothing implements it.
Succession is the only reading of "version" that `parentGenerationId` does not already cover, and
today nothing in the product can create one.

When that action lands, it is:

- One `replaces` edge between the two assets' `asset_reference` entities, written through
  `EntityRelationshipService`. `replaces` is already in `RELATION_TYPES` and already in
  `LINEAGE_RELATION_TYPES` — so it is non-removable, which is the correct property for succession
  and the wrong one for collection membership (§4.2). Design spec §26 names `replaced` in its own
  lineage vocabulary, so this is the spec's answer too.
- The label, if a label is wanted, is the 1-based position in that chain, computed for the
  inspector. **Not** a column — a stored number and a chain will disagree — and never a decimal:
  nothing in the model distinguishes a major from a minor revision, and inventing that distinction
  to match a mockup is how a fake field becomes a real migration.
- No table, no port, no new relation type.

Until then #178 and #179 need nothing from this section, and the correct thing for the library to
show where the mockup shows `v2.1` is nothing at all.

### 7.5 Alternatives considered

**(a) An `asset_versions` table.** §7.1: it would store a chain that `entity_relationships` already
stores, over rows that cannot change, in a second graph beside the entity graph.

**(b) Reuse `sourceAssetId` as the version chain.** Rejected: it means derivative variant, it is
check-constrained against being set on a `source` asset, and overloading it would make every
thumbnail a version of its own image.

**(c) Treat re-roll depth as the version number**, i.e. build exactly what the mockup shows.
Rejected in §7.2, and it is the one to keep in mind — it is what the mockup is a picture of, and
shipping it would make "version" mean "how many times someone pressed generate".

---

## 8. The concrete diff this authorises

Everything #178 and #179 need, with nothing left to re-decide:

**`packages/domain`**

- `entity/entity-type.ts` — `'asset_collection'` added to `ENTITY_TYPES`.
- `asset/asset.ts` — `tags: string[]` (via `normalizeTags`) and `pipelineStage: AssetPipelineStage`
  on `Asset`; `ASSET_PIPELINE_STAGES = ['concept', 'in_progress', 'production_ready']`.
- `asset/asset-repository.ts` — `tags` and `pipelineStages` on `AssetListFilter`.
- `asset/asset-service.ts` — `setTags`, `setPipelineStage`; both end in the existing `indexed(...)`.
- `asset/asset-collection-service.ts` — new; composes `EntityService` and
  `EntityRelationshipService`. No repository of its own.
- `activity/activity.ts` — `'asset_stage_changed'` in `ACTIVITY_TYPES`, `'asset'` in
  `ACTIVITY_SUBJECT_TYPES`.
- `search/search-document.ts` — `searchDocumentForAsset` reads `asset.tags`.

**`packages/database`**

- `schema/assets.ts` — `tags text[] not null default '{}'` with a GIN index; `pipeline_stage` enum
  column, `not null default 'concept'`, with an `(project_id, pipeline_stage)` index for the strip's
  counts and the stage filter.
- One generated migration (`pnpm db:generate`): three `ALTER TYPE ... ADD VALUE`, one `CREATE TYPE`,
  two `ALTER TABLE ... ADD COLUMN`, two `CREATE INDEX`. Existing rows take the defaults; no backfill
  script, which satisfies #179's "including ones that existed before the migration".
- `repositories/asset-repository.ts` — the two new filters, matching the tag predicate
  `entity-repository.ts` already uses.
- The read-model port #170 introduces gains: a `collectionId` filter, a `pipelineStages` filter,
  per-collection counts and per-stage counts.

**No new tables.**

**`apps/api`** — collection CRUD and membership endpoints, a stage-transition endpoint, and the new
filters on `GET /projects/:projectId/assets`; wired through `apps/api/src/domain/domain.module.ts`.

---

## 9. What this does not decide

Deliberately left open, each one a follow-up rather than an omission:

- **Whether `asset_reference` entities should be hidden from generic entity search and the command
  palette.** §4.6. It is a pre-existing duplicate-hit problem that collections make more visible,
  and it deserves its own issue rather than a clause in this one.
- **A shared tag vocabulary across `entities.tags` and `assets.tags`.** §5.5. The cheap mitigation —
  sourcing autocomplete from both — belongs to #172.
- **Per-project configurable pipeline stages.** #179 rules them out of that issue; the three-stage
  enum is chosen so a fourth stage is an enum value rather than a re-model.
- **Whether tag filtering should use the GIN index.** `entity-repository.ts` filters tags with
  `lower(tag)` over `unnest`, which does not use `entities_tags_idx`. Assets should match entities
  for now; making both use the index is one change to two predicates, and it is a performance issue,
  not a modelling one.
- **The `replaces` chain and the Versions tab.** §7.4. Blocked on a replace-asset action existing.
- **Collection ordering.** `EntityRelationship.metadata` is where a manual order would go if the
  design ever asks for one. The mockup does not.
