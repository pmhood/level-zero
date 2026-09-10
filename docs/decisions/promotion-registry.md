# Promotion: what the registry is, and what it deliberately is not

**Status:** decided in #87. Implements nothing; #69 is written against this shape.

Every claim about existing code below was read from the tree at `72dc538` on **2026-09-09**. File
and line references are listed in [Appendix A](#appendix-a--what-was-read).

---

## 1. Why this exists

[#69](https://github.com/pmhood/level-zero/issues/69) wants promotion to be "one reusable product
capability", built as "a small typed registry of product-supported promotions" and explicitly *not*
"a fully dynamic workflow engine". It lists nine flows and six fields a promotion definition should
carry.

That is a design brief, not a design. This document does the design, because the gap between the
two answers is the whole risk: a registry is by nature the kind of abstraction that grows a field
per caller until it is the workflow engine the issue told us to avoid.

The starting point is that the repo already contains three unrelated things called "promote". #69
treats at least two of them as instances of one capability. §2 checks that against the code.

---

## 2. What "promote" already means in this repo

### 2.1 `LineageService.promote` — source entity → new entity, plus a lineage edge

`packages/domain/src/relationship/lineage-service.ts:47`. Reads the source, refuses a target type
equal to the source's type, creates a new `Entity` carrying the source's name, description and tags
by default, links `source --promoted_to--> promoted`, records an `entity_promoted` activity, and
returns `{ source, promoted, relationship }`.

The source is untouched. It writes no duplicate guard of any kind: promoting the same idea to a
mechanic twice produces two mechanics and two edges, and the database's unique
`(source, target, relation)` constraint never fires because the target is new each time.

Reached over HTTP at `POST /api/projects/:projectId/entities/:entityId/promote`
(`apps/api/src/relationships/relationships.controller.ts:67`) and from the web app through
`api.promoteEntity` / `usePromoteIdea`.

**This service is not idea-specific.** It is generic over `EntityType` already. The only
idea-specific thing in the stack is the menu:

```ts
// apps/web/src/features/ideas/promotion.ts
export const IDEA_PROMOTION_TARGETS: readonly PromotionTarget[] = [
  { type: 'design_pillar', label: 'Turn into Design Pillar' },
  { type: 'mechanic',      label: 'Turn into Mechanic' },
  { type: 'character',     label: 'Turn into Character' },
  { type: 'location',      label: 'Turn into Location' },
];
```

That four-line constant is the registry, in miniature, in the wrong package. Recognising it as such
is most of §5.

### 2.2 `MoodboardService.promoteConnector` — board connector → an `EntityRelationship`

`packages/domain/src/moodboard/moodboard-service.ts:250`. Requires an editable board, requires the
connector, throws `ConflictError` if `connector.relationshipId` is already set, resolves both
endpoints to entity ids (an `asset` node is rejected — "an asset has no place in the entity graph
without an `asset_reference` entity in front of it"), links the two **pre-existing** entities with
a relation **the caller chooses at call time from all twelve `RelationType`s**, then writes the new
relationship's id back onto the connector row.

It creates no object. Its output *is* the edge. Its source is a `MoodboardConnector`, which is not
an entity and is not in the project graph at all.

### 2.3 `EntityVersionService.promote` — a version onto a branch

`packages/domain/src/version/entity-version-service.ts:230`. Appends a copy of one version's
snapshot to the tip of another branch, with `reason: 'promotion'`. A third homonym, from #4's
branching vocabulary. Nobody has proposed folding this into #69 and nobody should; it is noted here
only so a future reader does not rediscover it and assume it was overlooked.

### 2.4 Two of #69's flows already exist under other names

- **"Concept Asset → Character visual"** is implemented today, client-side, as
  `useAttachVisual` (`apps/web/src/features/characters/use-characters.ts:211`): list
  `asset_reference` entities, find one already pointing at the asset or create it, then link
  `character --references--> reference`. `references` is a *structural* relation, not lineage.
- **"Mechanic → Prototype inclusion"** is `PrototypeService.capture`
  (`packages/domain/src/prototype/prototype-service.ts:112`), which writes a `PrototypeMember`
  — `{ entityId, entityVersionId }` — into a new immutable `PrototypeVersion`. Members are fixed
  at capture, so "include a mechanic in a prototype" is structurally "capture a new prototype
  version", and it produces neither an entity nor an `EntityRelationship`.

### 2.5 What the design spec already says

`docs/design/frontend-design-system-and-implementation-spec.md` §62 predates both #69 and this
document, and it is the source of truth for anything user-facing. It specifies the
`PromoteAction` component (built, in `packages/ui/src/promote-action.tsx`), lists the same flows,
and closes with one line: *"Promotion should create a lineage edge automatically."*

Its list differs from #69's in two places that matter, and the spec's wording is the better one:

- **"Mechanic → Prototype"**, not "Mechanic → Prototype inclusion". The target is a prototype, an
  object. §5.3 follows the spec.
- **"Reference → Visual Direction"**, not "Reference / Moodboard item → …". A reference is an
  `asset_reference` entity, which is in the graph. §5.3 follows the spec.

The spec's "Concept → Character Sheet" is a third phrasing of #69's "Concept Asset → Character
visual". Neither is a promotion; see §8.

Note also that the spec's `PromoteAction` props are `from`, `to` and `label` — the same three
fields §5.1 arrives at, reached independently from the flows. That is a good sign, and it means the
catalogue feeds the component directly.

### 2.6 The vocabulary, as actually used

`RELATION_TYPES` has twelve members; `LINEAGE_RELATION_TYPES` has five. Of the five, production code
writes exactly two:

| Relation         | Written by                                                        |
| ---------------- | ----------------------------------------------------------------- |
| `promoted_to`    | `LineageService.promote`                                          |
| `generated_from` | `LineageService.recordGeneratedFrom` (AI provenance, #6/#8)       |
| `derived_from`   | nothing                                                            |
| `inspired_by`    | nothing                                                            |
| `replaces`       | nothing                                                            |

Lineage edges cannot be unlinked — `EntityRelationshipService.unlink` throws `ConflictError` for any
of the five.

---

## 3. Decision 1 — is `promoteConnector` a promotion?

**No.** #69 should be scoped to source → target-object promotions, and `promoteConnector` should
stay exactly where it is, in `MoodboardService`.

Five independent reasons, each sufficient on its own:

1. **There is no source object.** A `MoodboardConnector` has no `EntityType`, no id in the entity
   graph, and no lifecycle outside its board. A definition field named "allowed source types"
   cannot be filled in for it.
2. **There is no target object.** #69's own Behavior clause is "promotion creates a new target
   object or explicit target association" *and* "records the appropriate lineage/relationship
   edge". `promoteConnector` produces only the second half. Reading "or explicit target
   association" as licence to include it makes the clause vacuous — it would then also cover
   `EntityRelationshipService.link`, i.e. every link in the product.
3. **The relation is user input, not definition data.** A promotion definition's whole job is to
   fix the edge a flow writes. `promoteConnector` takes the relation as a request-body parameter
   (`PromoteMoodboardConnectorDto`) and the moodboard inspector renders a picker for it. A
   "definition" that leaves its central field to the caller is not a definition.
4. **Its conflict rule is board bookkeeping, not idempotency policy.** It throws because
   `connector.relationshipId` is a single-valued back-pointer with nowhere to put a second id —
   see §6, where treating that rule as the general one breaks a legitimate flow.
5. **Both ends already exist and are already canon.** Nothing is being made more canonical. The
   board annotation is being *published* into the graph. That is a different verb, and the code
   already says so: a comment in `MoodboardService` calls it "the one action that reaches the
   project graph".

The name collision is real and mildly unfortunate, and it is user-facing (`Promote` button in the
moodboard inspector). Renaming it is a separate, optional change — see §9. It is not this
document's business and it must not be smuggled into #69.

**Consequence for #69:** its acceptance criterion "at least one Moodboard/Asset promotion flow …
use the same infrastructure" cannot be met by `promoteConnector`. §5.3 supplies a moodboard flow
that does fit. #69's flow list should be amended accordingly.

---

## 4. Decision 3 — which `RelationType` each flow records

**`promoted_to`, for all of them. No new relation is needed, and none should be added.**

Every flow that survives §3 is the same sentence: *this source became that target, and the source
is still here.* That is exactly what `promoted_to` means, it reads correctly source-first
(`idea promoted_to mechanic`), and the README already states it as a project-wide rule.

The four other lineage relations are not substitutes, and the fact that three of them are written
nowhere (§2.6) is a warning, not an invitation:

- **`generated_from`** is owned by the AI provenance pipeline. Overloading it would make "was this
  produced by a model?" unanswerable.
- **`derived_from`** should stay reserved for same-kind derivation — an asset variation, a
  duplicated entity. Promotion always crosses types (`LineageService.promote` refuses a same-type
  target), so it is never the right word here.
- **`inspired_by`** is a soft, user-asserted influence. Promotion is a system-recorded fact.
- **`replaces`** asserts supersession, which promotion explicitly is not: the source survives
  unchanged.

Adding a relation would be a schema decision affecting the `entity_relationships` enum, the
lineage/structural split, the unlink rule and every relationship filter in the UI. Nothing in the
three flows below needs one.

---

## 5. Decision 2 and 5 — the definition shape, and where it lives

### 5.1 The shape

```ts
// packages/domain/src/promotion/promotion-definition.ts

/**
 * One promotion the product offers: what it can be started from, what it makes,
 * and what the action is called.
 *
 * Data only. A definition never names the code that runs it — see the non-goals.
 */
export interface PromotionDefinition {
  /** Source entity types this promotion is offered for. */
  sourceTypes: readonly EntityType[];
  /** What it creates. Always a new entity; the source is never converted. */
  targetType: EntityType;
  /** The action's label, e.g. "Turn into Mechanic". */
  label: string;
}

export const PROMOTIONS: readonly PromotionDefinition[] = [ /* §5.3 */ ];

/** The promotion offered for this pair, or `undefined` if the product does not offer one. */
export function findPromotion(
  sourceType: EntityType,
  targetType: EntityType,
): PromotionDefinition | undefined;

/** Every promotion offered for a source type — the menu a workspace renders. */
export function promotionsFor(sourceType: EntityType): readonly PromotionDefinition[];
```

Three fields and two pure lookups. Everything is a string or an array of strings, so the whole
catalogue is JSON-serialisable and can be handed to the web app verbatim.

### 5.2 What was cut from #69's six fields, and why

The test applied is the issue's own: *a field with one plausible value across every definition is
not a field.*

| #69's field                     | Verdict  | Why                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| allowed source type(s)          | **kept** | Genuinely varies: `['idea']`, `['asset_reference', 'moodboard']`, `['mechanic', 'system', 'scene']`.                                                                                                                                                                                                             |
| target type / action            | **half** | `targetType` kept. **"action" cut**: every promotion's action is "create one entity of `targetType`". The moment a definition needs to name an action it is a dispatch table — non-goal 1.                                                                                                                       |
| default field mapping           | **cut**  | Every flow wants the same mapping, and it already exists in `LineageService.promote`: carry name, description and tags; leave `data` empty. Type-specific seeding is not wanted either — `mechanic.ts`, `character.ts` and `world.ts` each document that their `data` is schemaless *precisely* so a promoted entity "renders as an empty form rather than breaking". The carry-over rule is one rule in one service, not a field repeated identically nine times. |
| relationship / lineage relation | **cut**  | One value across every definition (§4). Re-add it the day a second relation is genuinely needed; adding a field to a three-field interface is a one-line change, and until then the field is an invitation to invent flows.                                                                                       |
| validation                      | **cut**  | The only per-flow validation any of these need is "is the source's type allowed", which `sourceTypes` *is*. The type-inequality check already lives in `promote`. A per-definition validator function is a plugin point with one implementation — non-goal 2.                                                     |
| optional contextual UI copy     | **half** | `label` kept; it already exists as data in `IDEA_PROMOTION_TARGETS`. Longer copy cut: `idea-inspector.tsx` renders one fixed sentence ("Creates a new entity and keeps this idea exactly as it is.") for all four targets, which is evidence that per-definition prose is not wanted.                             |

Also considered and cut: a stable `id`. The pair `(sourceType, targetType)` is the identity, the
activity record already carries both, and an id would only be a second name for the same thing.

### 5.3 The three flows, written out

**Flow 1 — Idea → Mechanic** (and the `design_pillar`, `character`, `location` siblings, which are
the same entry with a different `targetType`):

```ts
{ sourceTypes: ['idea'], targetType: 'mechanic', label: 'Turn into Mechanic' }
```

Executed by `LineageService.promote`. Writes `idea --promoted_to--> mechanic`. This is exactly
today's behaviour, so migrating Idea Lab is deleting `apps/web/src/features/ideas/promotion.ts` and
reading `promotionsFor('idea')` instead.

**Flow 2 — Moodboard / reference → Visual Direction:**

```ts
{ sourceTypes: ['asset_reference', 'moodboard'], targetType: 'design_pillar',
  label: 'Make this the visual direction' }
```

Executed by `LineageService.promote`. Writes `asset_reference --promoted_to--> design_pillar`.

There is no `visual_direction` entity type and this document does not propose one: a stated visual
direction is a design pillar, which is what `design_pillar` is for. Both source types are supported
because a moodboard *item* worth promoting is an `entity` node pointing at an `asset_reference`
(an `asset` node is not in the graph — the same rule `promoteConnector` enforces), and a whole
board is itself a `moodboard` entity.

This flow has a prerequisite that is **not** part of the registry: the asset must already have an
`asset_reference` entity. That find-or-create currently lives in the web app
(`useAttachVisual`) and should move into the domain before #69 lands. See §9.

**Flow 3 — Mechanic → Prototype:**

```ts
{ sourceTypes: ['mechanic', 'system', 'scene'], targetType: 'prototype',
  label: 'Prototype this' }
```

Executed by **`PrototypeService.create`**, not by `LineageService.promote`, because a `prototype`
entity with no `PrototypeVersion` is not a valid prototype: `create` exists precisely to make the
entity and capture v1 in one step. It calls `findPromotion(source.type, 'prototype')` for the same
validation, and gains an `EntityRelationshipService` dependency so it can write
`mechanic --promoted_to--> prototype` alongside the `PrototypeMember` pin.

The member pin (`entityVersionId`) and the edge answer different questions and both are wanted: the
pin says *which version was in it*, the edge makes the prototype findable from the mechanic through
the ordinary relationship graph.

This is the flow that decides §5.4, so it is stated bluntly: **two of the three flows run in one
service and one runs in another, and the catalogue does not hide that.**

### 5.4 Where the layer lives — and why there is no `PromotionService`

`packages/domain/src/promotion/promotion-definition.ts`. One file, one new directory, matching the
one-concept-per-directory shape of its siblings. `packages/domain/src/compare/` is the precedent
for a directory that holds pure functions and no service.

**There is no new service.** `LineageService` already documents itself as "workflows that create
entities *and* the lineage explaining where they came from", which is the definition of promotion.
A `PromotionService` that did the same thing would be a second class with the same responsibility —
the S in SOLID read backwards.

`LineageService.promote` changes by one guard: reject the call when
`findPromotion(source.type, input.type)` is `undefined`, with a `ValidationError`. The catalogue
thereby becomes the validation, no new method and no new input field are required, and the existing
signature and HTTP contract are unchanged.

**The cycle question.** The issue asks how a promotion touching several domain areas composes
without a dependency cycle. The answer is that it does not touch several areas, because the
catalogue holds no behaviour. It imports `EntityType` and nothing else. `LineageService`,
`PrototypeService` and later `AssetService` each import the catalogue; the catalogue imports none of
them; none of them need to import each other. A cycle is impossible by construction rather than by
discipline — which is the actual argument for the data-only shape, more than brevity is.

The one-way rule (`apps/*` → `packages/database` → `packages/domain`) is untouched: the catalogue is
in `domain`, `apps/web` reads it the way it already reads `EntityType`.

---

## 6. Decision 4 — idempotency

**Rule: a promotion always creates. It is never refused as a duplicate and never silently returns
an existing target.**

Re-promoting the same source to the same target type produces a second target and a second
`promoted_to` edge. Determinism — #69's actual requirement — is met by the rule being unconditional,
not by a guard.

Two alternatives were considered and rejected:

- **Refuse (409) when the source already has a `promoted_to` edge to an entity of the target
  type.** This is `promoteConnector`'s rule generalised, and it breaks flow 3 outright:
  prototyping the same mechanic twice, as two differently framed experiments, is normal work, not
  a mistake. It also mis-serves flow 1 — one rich idea legitimately becomes two characters. A rule
  with a per-definition exemption is a per-definition field, which §5.2 cut.
- **Get-or-create: return the existing promotion.** Deterministic and retry-safe, but it makes the
  button lie. "Turn into Character" would silently do nothing, and the user cannot tell a no-op
  from a success.

Duplicate *protection* is therefore a caller concern, and #69 should specify it as UI work rather
than domain work:

- the action is disabled while a promotion is in flight (`PromoteAction` already takes `pending`);
- existing promotions are listed next to the action, which costs no new query — `promoted_to` edges
  already come back resolved from `EntityRelationshipService.neighborhood`, and Idea Lab already
  renders them in its Links tab.

**Migration implications for the two existing implementations:**

- **`LineageService.promote`** — no behavioural change. It already always creates. The only diff is
  the catalogue guard in §5.4, which narrows *which pairs* are allowed, not how often. One
  behavioural consequence worth naming: `idea → faction` and every other pair not in the catalogue
  starts returning 400 where it used to succeed. Nothing in the repo calls those pairs today.
- **`MoodboardService.promoteConnector`** — no change, and it is not migrated. Under §3 it is not a
  promotion, so this rule does not reach it; its `ConflictError` continues to guard the connector's
  single-valued `relationshipId`, which is the right rule for a back-pointer and, as §3.4 argued,
  the wrong rule for a promotion. That the two need opposite rules is further evidence they are
  different operations.

---

## 7. Decision 6 — non-goals

Written so each is checkable in review, not aspirational.

1. **No dispatcher.** A `PromotionDefinition` never names the code that executes it: no `execute`,
   `handler`, `service` or `method` field, and no string that is looked up in a map of functions.
   *Check: every field of the interface is a `string` or a `readonly string[]`.*
2. **No per-definition functions.** No field mapper, no validator, no predicate, no UI renderer.
   *Check: `JSON.parse(JSON.stringify(PROMOTIONS))` round-trips without loss.*
3. **No runtime or user-defined promotions.** The catalogue is a `const` array compiled into
   `packages/domain`. There is no `register()`, no `promotions` table, no config file, no
   project-level override. *Check: nothing writes to `PROMOTIONS`; adding a promotion is a diff.*
4. **No multi-step or conditional promotions.** One promotion makes one target entity and one edge.
   No definition produces two targets, chains into another promotion, or branches on the source's
   `data`. *Check: `PromotionResult` stays `{ source, promoted, relationship }`.*
5. **No inverse.** There is no demote, un-promote or undo. Lineage edges are already unremovable
   (`unlink` throws for all five lineage relations); the registry does not add a way around that.
   *Check: no method deletes a `promoted_to` edge.*
6. **The registry does not own edges between two entities that already exist.** That is
   `EntityRelationshipService.link` for ordinary links and `MoodboardService.promoteConnector` for
   board publication. *Check: no definition exists whose output is only an edge.*
7. **No `Prototype → Production Task`.** There is no `production_task` entity type and this
   document does not invent one, per the issue's own constraint. It is not represented as a
   placeholder either: a definition whose `targetType` is not an `EntityType` does not compile,
   which is the type system giving the correct answer. The flow returns when a production-task
   model exists, as its own issue.

If a reviewer sees a change that would violate 1, 2 or 4, that is the workflow engine arriving, and
the correct response is to keep the flow in its own service rather than to widen the definition.

---

## 8. Recommendation

Build #69 as:

- a data-only catalogue at `packages/domain/src/promotion/promotion-definition.ts` — three fields,
  two pure lookups, no service;
- `LineageService.promote` unchanged except for one validation guard against the catalogue;
- `PrototypeService.create` reading the same catalogue and writing the same `promoted_to` edge;
- `apps/web/src/features/ideas/promotion.ts` deleted in favour of `promotionsFor('idea')`;
- duplicate protection specified as UI behaviour, not a domain guard;
- `MoodboardService.promoteConnector` left alone.

And amend #69's flow list: drop `Prototype → Production Task` to a follow-up, restate
"Reference / Moodboard item → Visual Direction" as `asset_reference | moodboard → design_pillar`,
and restate "Concept Asset → Character visual" as what it is — ordinary linking through an
`asset_reference`, which #69's own UI clause says must be *distinguished* from promotion.

### The strongest argument against

**This is a validation table and a menu, not a capability.** #69 asked for "a reusable promotion
service/command layer rather than custom mutation logic in each workspace", and what §5 delivers is
three strings per flow plus a guard. Two of the three flows still execute in different services, so
the claim that they "use the same infrastructure" rests on them sharing a lookup function and a
relation name — which is thinner than the issue's language implies, and a reviewer could reasonably
say the mutation logic was never actually centralised.

The rebuttal is asymmetry of cost. To centralise execution, the layer must be able to produce an
entity, an entity plus a pinned immutable version row, and (if `promoteConnector` were included) a
bare edge. Nothing in the repo can express those three as one operation without a field naming the
operation — and that field is the workflow engine. If this shape turns out too thin, the fix is
adding a fourth field to a three-field interface. If a dispatcher turns out too thick, the fix is
unpicking it from every flow that learned to depend on it. The registry is justified by three real
flows that share a *vocabulary*; it is not justified as a shared *executor*, and this document
declines to claim otherwise.

### The second-strongest

**The API is not retry-safe.** §6 makes a repeated POST create a second entity, and the mitigation
is a disabled button. A dropped response on a slow connection leaves a duplicate mechanic that
cannot be cleanly deleted, because its `promoted_to` edge is unremovable and entities are archived
rather than deleted. The counter is that this is already true today and no duplicate has been
reported, and that a request-idempotency key is a general API concern rather than something the
promotion registry should solve alone.

---

## 9. Follow-up

Work this document implies but does not do:

- **#69** implements §8. Its acceptance criteria need the amendments in §8's last paragraph before
  it is picked up.
- **Move `asset_reference` find-or-create into the domain.** `useAttachVisual`
  (`apps/web/src/features/characters/use-characters.ts:211`) does a list-then-create in the browser
  and caps the scan at 200 references, so it will start duplicating reference entities in a project
  with more than that. It belongs in `AssetService` as a single call. Flow 2 depends on it. This is
  its own issue, not part of #69.
- **Optional: rename `promoteConnector`.** `publishConnector` — or `linkFromConnector` — would end
  the collision §3 documents. It touches the domain service, the controller route
  (`POST …/connectors/:connectorId/promote`), `apps/web/src/lib/api.ts`, `use-moodboards.ts`, the
  moodboard inspector and its user-facing "Promote" button. Worth doing only if the naming keeps
  causing confusion; not worth bundling into #69.
- **`docs/design/frontend-design-system-and-implementation-spec.md` §62** needs no amendment:
  its flow list is the one §8 recommends, its "promotion should create a lineage edge
  automatically" is §4, and its `PromoteAction` props are the catalogue's three fields. Noted so
  #69 does not re-derive the component or re-litigate the list.

---

## Appendix A — what was read

Everything below was read from the working tree at `72dc538` on **2026-09-09**. No claim here comes
from an issue description or a README summary alone.

**The two implementations the issue names**

- `packages/domain/src/relationship/lineage-service.ts` — `PromoteEntityInput`, `PromotionResult`,
  `promote` (line 47), `recordGeneratedFrom`.
- `packages/domain/src/moodboard/moodboard-service.ts` — `promoteConnector` (line 250),
  `MoodboardConnectorPromotion`, `requireEntityEndpoint`.
- `packages/domain/src/moodboard/moodboard-connector.ts` — `relationshipId` is a single nullable
  field on the connector row.
- `apps/web/src/features/ideas/promotion.ts`, `apps/web/src/features/ideas/use-ideas.ts`,
  `apps/web/src/features/ideas/idea-inspector.tsx`.

**The vocabulary and its guarantees**

- `packages/domain/src/relationship/relation-type.ts` — twelve relations, five lineage relations.
- `packages/domain/src/relationship/entity-relationship-service.ts` — `link` throws `ConflictError`
  on a duplicate `(source, target, relation)`; `unlink` throws for any lineage relation.
- The "written by nothing" column of §2.6 is
  `grep -rn "'derived_from'\|'inspired_by'\|'replaces'"` across `packages` and `apps`, excluding
  tests and `relation-type.ts` itself. Hits exist in `apps/web/src/features/entities/entity-presentation.ts`
  (the `RELATION_LABELS` map at lines 38, 40, 47), but they are label definitions, not writes of
  edges.

**The flows #69 lists**

- `packages/domain/src/entity/entity-type.ts` — nineteen types; no `visual_direction`, no
  `production_task`.
- `packages/domain/src/prototype/prototype-service.ts` (`create`, `capture`, `resolveMembers`) and
  `prototype-version.ts` (`PrototypeMember`, "members is fixed at capture").
- `packages/domain/src/asset/asset-reference.ts`, `packages/domain/src/asset/asset.ts`.
- `packages/domain/src/moodboard/moodboard-node.ts` — `asset` and `entity` nodes.
- `apps/web/src/features/characters/use-characters.ts` (`useAttachVisual`) and
  `character-visual.ts` (`VISUAL_RELATION = 'references'`).

**Wiring, for §5.4's cycle claim**

- `apps/api/src/domain/domain.module.ts` — `LineageService` is constructed from `EntityService`,
  `EntityRelationshipService` and `ActivityService`; `PrototypeService` from the prototype-version
  repository, `EntityService`, the entity-version repository, the asset repository and
  `ActivityService`, with **no** `EntityRelationshipService` today; `MoodboardService` from the
  moodboard repository, `EntityService`, the asset repository and `EntityRelationshipService`.

**The design spec**

- `docs/design/frontend-design-system-and-implementation-spec.md` §62 (lines 2176-2201) — the
  `PromoteAction` contract, the flow list quoted in §2.5, and the lineage-edge requirement.

**The third homonym**

- `packages/domain/src/version/entity-version-service.ts:230` — `promote` a version onto a branch.

**Not verified**

- **Whether `design_pillar` is the target the product owner means by "Visual Direction".** §5.3
  argues it from the type list, not from a stated product intent. If a distinct
  `visual_direction` type is wanted, that is an `ENTITY_TYPES` change and its own decision; the
  definition shape is unaffected either way.
- **Whether flow 3 should also be offered from `scene`.** `scene` and `system` are included by
  analogy with `mechanic`; no existing UI offers a prototype action from either.
