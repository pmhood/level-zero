# Consistency findings: persisted, computed, or hybrid

**Status:** decided in #88. Blocks #72. This document implements nothing.

Every claim below about what the code does was read from the tree at **`72dc538`** on
**2026-09-09**. The files are listed in [Appendix A](#appendix-a--how-the-code-evidence-was-obtained);
where this document says "today", it means that commit.

The headline, before the reasoning: **findings are computed by a scan and stored as a derived
snapshot of that scan, keyed by a stable fingerprint that carries no values and no version ids.
Dismissal is the one authoritative thing on the row and survives every rebuild.** And the check #72
leads with — "the GDD says 120 s, the canonical mechanic says 90 s" — **cannot be written today**,
because no structured link from document content to a mechanic parameter exists in the editor's node
schema. That is [§7](#7-what-the-first-deterministic-check-can-actually-read), and it changes #72's
scope.

---

## 1. Why this exists

#72 asks for a project-wide consistency surface whose findings can be **dismissed and resolved
without deleting their historical record**. That requirement quietly forces an architectural choice
the issue never makes: is a `Finding` a row somebody writes, or a fact somebody computes?

The choice is not recoverable later. If findings are rows, every check written afterwards has to
think about invalidation. If findings are computed, every check written afterwards has to produce a
key that dismissal can attach to. Nothing about the second shape can be retrofitted onto the first
without rewriting all of them.

There is a second, less obvious reason this document exists. #72's own example of a deterministic
check assumes a piece of infrastructure — a structured reference from a GDD to a mechanic parameter
— and the assumption is wrong. Finding that out costs half a day now and half a feature later.

---

## 2. The decision in one page

| #   | Question                          | Decision                                                                                                                                    |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Persisted, computed, or hybrid    | **Hybrid, in one table.** The finding set is computed by a scan; the row is persisted and upserted on `(projectId, fingerprint)`; the row's *content* is derived and overwritten every scan, its *dismissal* is authoritative and is not. |
| 2   | Staleness                         | **Displayed, not invalidated.** The table is the record of the last scan and every row carries that scan's time. A contradiction fixed by ordinary editing is marked `resolved` by the next scan; until then the surface says when it last looked. |
| 3   | Check interface                   | A deterministic check is a **synchronous pure function** `(facts: ProjectFacts) => CheckFinding[]`, registered by id. It receives one project's records, already loaded; it returns fingerprints, severities, summaries and evidence. It has no repository, no clock and no provider, so it cannot reach a second project or an AI. |
| 4   | What the first check reads        | **The structured GDD→parameter link does not exist.** Mentions and embeds carry `entityId`/`entityType`/`label` and nothing finer. #72 needs a `parameterReference` node first — and once it has one, the mismatch it was going to detect mostly stops happening. See §7. |
| 5   | Where findings run                | **A `consistency_scan` job in `apps/worker`**, `targetId = projectId`, queued on demand, deduplicated exactly like `requestReindex`. Not a request-time operation. |
| 6   | AI provenance                     | **Reuses `Generation` unchanged.** `Finding.generationId` is non-null exactly when `origin === 'ai_assisted'`, following the precedent of `DOCUMENT_VERSION_GENERATION_KEY`. No new provenance mechanism. |

---

## 3. Persisted, computed, or hybrid

### 3.1 What each pure option costs

**Computed on read** is the option with the best property: a finding cannot be wrong, because it does
not outlive the condition that produced it. Fix the number and the row is gone on the next render;
there is no invalidation code, so there is no invalidation bug. Dismissal is handled by a small
`dismissed_findings` table keyed by a fingerprint, which is the only durable state the feature
actually needs.

It fails on cost and on memory. A project-wide pass walks every entity, every document body and every
prototype version, and #72's AI half makes provider calls on top of that. That is not something a
page load can do, so the result has to be cached somewhere the next request can read — and the moment
it is cached, the "always true" property is gone and the design is a hybrid that has not admitted it.
It also cannot answer "when did this stop being a problem", and a design-review surface gets asked
that. #72's finding model lists timestamps and resolution metadata; computed-on-read has nowhere to
put them.

**Fully persisted** — findings are rows a check writes and a service maintains — gives dismissal an
obvious home and makes history inspectable, and it is what the finding model in #72 reads like. Its
cost is that every check becomes two pieces of code: the one that notices the contradiction, and the
one that notices the contradiction went away. The second is always written worse than the first,
because it is invisible until a user complains that the Consistency page is lying. It also makes each
new check an `effort:medium` issue rather than an `effort:low` one, which is the opposite of what
decision 3 is trying to achieve.

### 3.2 The decision

**Hybrid, and it collapses into one table.**

- A scan computes the complete finding set for a project from scratch. No check ever reads or updates
  an existing finding row.
- Each produced finding is **upserted on `(projectId, fingerprint)`**. Its summary, severity,
  evidence, `origin`, `generationId` and `lastSeenScanAt` are overwritten wholesale.
- Any row for that project whose fingerprint the scan did **not** produce, and that is not already
  `resolved`, is closed: `status = 'resolved'`, `resolvedAt = <scan time>`. It is never deleted.
- `status = 'dismissed'` is the exception to "overwritten wholesale". A scan that re-produces the
  fingerprint of a dismissed row refreshes its content and **leaves the status alone**. Dismissal is
  the only thing on the row a check cannot touch.

That is the whole lifecycle. The row's content is derived; the row's lifecycle is authoritative; one
table holds both, because a second `dismissed_findings` table would only ever be joined back to the
first one on the same key.

The precedent is already in the repo. `SearchDocument` is documented as *"derived: it holds no
creative content of its own and can be rebuilt from the row it mirrors at any time, which is why it
is not an `Entity`"*, and its schema carries `unique('search_documents_source_key')` with the comment
*"re-indexing is an upsert on it"*. A finding is the same kind of object: a derived, rebuildable,
project-scoped row that is not an entity, keyed so that rebuilding is an upsert. The only thing it
adds is a user decision that must not be rebuilt away.

The contrast that makes the split legible is `Activity`, which goes the other way on purpose: its
summary is *"composed at the moment the event happens ... then stored verbatim and never
regenerated"*, because a feed must keep reading sensibly after its subject is renamed or deleted. A
finding is not history. It is a claim about the present, and a claim about the present should be
rewritten when the present changes.

### 3.3 The strongest argument against

Computed-on-read's best argument is not performance, and it is not simplicity. It is that **a stored
finding is a lie waiting to happen, and this design ships the lie deliberately.** Between the moment
someone fixes the oxygen number and the moment the next scan runs, the Consistency surface says there
is a contradiction and there is not. No amount of "the row is derived" changes what the user reads.

The answer is §5, and it is a real answer rather than a dodge: the surface never presents findings as
the current state of the project. It presents them as *the result of a scan, run at a stated time*,
the way a test report or a linter run is presented. That framing is honest, it is what makes "run
analysis" a meaningful button, and it is cheap. But it is a framing, not a fix, and it is the cost of
this decision.

The second-strongest is that a fingerprint is a thing an implementer can get wrong in a way nobody
notices for months — put a value in it and dismissals silently evaporate, put a version id in it and
every edit reopens everything. §4 exists to make that unmissable.

---

## 4. Finding identity: the fingerprint

### 4.1 The rule

A fingerprint answers exactly one question: *did the previous scan already tell me about this?*

> **A fingerprint names the check that noticed and the canonical objects in tension. It never
> contains a value, a version id, a timestamp, a document position, or any model-generated text.**

Concretely, a check builds its fingerprint from its own `id` plus the identifying parts, joined with
a separator and hashed the way `search-document.ts` already hashes — `createHash('sha256')` from
`node:crypto`, hex digest. Hashing is for length and for keeping the unique index narrow; the parts
are what matter.

### 4.2 What it deliberately excludes, and why

- **Values.** If `90` and `120` were in the fingerprint, editing the mechanic from 90 to 95 would mint
  a new finding and abandon the dismissal on the old one. A user who has already said "these two are
  allowed to disagree" would be asked again after every tuning pass.
- **Entity version ids.** Same failure, harder: the objects a finding cites are versioned
  (`Entity.currentVersionId`, `EntityVersion.versionNumber`), so a version id in the fingerprint means
  every save reopens every dismissed finding touching that entity.
- **Document positions.** There is nothing stable to use. TipTap nodes in this codebase carry no ids;
  `documentOutline` locates a heading by its text and its place in reading order, both of which move
  when someone types above it. Evidence may carry a heading path for the reader; the fingerprint may
  not.
- **Model prose.** Two runs of the same AI check over the same two characters are the same finding
  even when the sentences differ.

### 4.3 The three fingerprints #72 names

| Check                  | Parts, in order                                                             |
| ---------------------- | --------------------------------------------------------------------------- |
| `stale-prototype-pin`  | `checkId`, `prototypeVersionId`, `entityId`                                 |
| `duplicate-name`       | `checkId`, `entityType`, the two `entityId`s **sorted**                     |
| `parameter-mismatch`   | `checkId`, `documentEntityId`, `mechanicEntityId`, `parameterId`            |

Sorting the pair in `duplicate-name` is load-bearing: a finding about an unordered pair must not
depend on which one the iteration reached first, or a scan whose entity ordering changes produces a
"new" finding and drops the dismissal.

`parameterId` is safe to use here because `parameter.ts` is explicit that it is minted once and never
recomputed — *"renaming a parameter, reordering the list, or editing its bounds all leave it alone"*.
It is the only part of a parameter that belongs in a fingerprint. (This row is listed for
completeness; §7 explains why the check itself cannot be built yet.)

### 4.4 What dismissal therefore means

Because the fingerprint excludes values, dismissing a finding means:

> **"I have judged this check, over these objects, not to be a problem"** — not "I have judged these
> numbers".

So a GDD that says 120 s against a mechanic at 90 s, dismissed, stays dismissed when the mechanic
moves to 130 s. That is a deliberate trade and the surface should make it visible: a dismissed finding
still renders its evidence *as of the latest scan*, so the numbers on screen are current even though
the decision is old, and undismissing is one click. The alternative — a dismissal keyed to values —
is worse in the common case and better in a rare one.

---

## 5. Staleness

**Nothing invalidates a finding. The scan is the only writer, and every row says which scan wrote it.**

What happens when someone fixes the contradiction by ordinary editing, with nobody visiting the
Consistency surface: nothing, until the next scan. Then the check does not produce that fingerprint,
the runner closes the row with `status = 'resolved'` and `resolvedAt`, and the historical record #72
asks for is exactly that closed row — what the contradiction was, when it was first seen, when it
stopped being true.

Three consequences worth stating so they are not rediscovered as bugs:

1. **`resolved` is not a status a user sets.** There is no "mark as resolved" action. Resolving a
   finding means fixing the thing, and the scan notices. A "resolve" button that did not change the
   underlying objects would put the table back in the business of lying.
2. **Every surface that shows findings shows the scan time.** The project-level page shows it once,
   at the top, next to the button that queues a new scan. The contextual per-entity badges #72 asks
   for read the same stored rows, so they inherit the same timestamp and must be able to show it.
3. **A finding whose cited object was deleted is not special.** The next scan will not produce it,
   because the check iterates over what exists, so it resolves like any other. A closed row still
   reads sensibly because its evidence keeps the prose it was written with (`where`, `states`) beside
   the id — the same reason `EntityReferenceAttributes` keeps a `label` next to `entityId`.

The alternative considered and rejected: invalidating findings on entity writes, by having
`EntityService` mark touching findings stale the way `SearchIndexService.entityChanged` refreshes a
search row. It is rejected because a search row can be rebuilt from the entity that changed, alone,
while a finding is a statement about a *pair* — recomputing it needs the other object too, and often
a third, at which point the "cheap incremental update" is a scan. Queueing a scan per autosave is not
an option; `document-service.ts` autosaves.

---

## 6. The check interface

The constraint from #88 is "a typed registry of named checks, not a rules DSL", and the goal is that
each later check is an `effort:low` issue. Both point at the same shape: **a check is a pure
function, and the runner does everything else.**

### 6.1 What a check receives

```ts
/**
 * One project's records, loaded once per scan and handed to every check.
 *
 * A check receives facts rather than repositories for three reasons: it makes
 * every check a pure function that a test can call with three hand-built
 * entities; it stops nine checks issuing nine passes over the same tables; and
 * it makes the project-scoping constraint structural — a check has no way to
 * reach a row it was not given.
 */
export interface ProjectFacts {
  projectId: string;
  /** Every entity in the project, archived included. Checks filter by `status` themselves. */
  entities: readonly Entity[];
  /** Every prototype version in the project, in no guaranteed order. */
  prototypeVersions: readonly PrototypeVersion[];
}
```

Three fields, because the three checks #72 names need exactly these. `EntityVersion` rows are
deliberately absent: the stale-pin check compares a pinned `entityVersionId` against
`Entity.currentVersionId`, which is on the entity. A later check that genuinely needs version history
adds a field then, with a real requirement behind it.

`readParameters(entity)` and `documentContent(entity)` read the type-specific parts out of
`entity.data`, so `ProjectFacts` does not need parameter or document fields of its own.

### 6.2 What a check returns

```ts
/** How much a finding matters. Maps onto the three non-success `StatusTone`s. */
export const FINDING_SEVERITIES = ['info', 'warning', 'conflict'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/**
 * One place to look, and what it says there.
 *
 * `entityId` is the finest locator the codebase can offer today (§7.2): there
 * is no stable address for a block inside a document. `where` is prose for the
 * reader — a heading path, a parameter label — and is never parsed.
 */
export interface FindingEvidence {
  entityId: string;
  /** Set when the evidence is a specific pinned version rather than the entity as it stands. */
  entityVersionId?: string;
  where: string;
  /** What that place asserts, already formatted: `120 s`, `v3`, `Oxygen Management`. */
  states: string;
}

/** What a check reports. The runner supplies identity, lifecycle and timestamps. */
export interface CheckFinding {
  fingerprint: string;
  severity: FindingSeverity;
  /** One sentence, shown verbatim. */
  summary: string;
  /** At least two: a contradiction has two sides. */
  evidence: FindingEvidence[];
}

/** A deterministic check: named, registered, and provably not an AI call. */
export interface ConsistencyCheck {
  /** Stable, kebab-case, and part of every fingerprint it mints. */
  id: string;
  /** Shown as the finding's category on the surface. */
  title: string;
  run(facts: ProjectFacts): CheckFinding[];
}

export const CONSISTENCY_CHECKS: readonly ConsistencyCheck[] = [
  stalePrototypePinCheck,
  duplicateNameCheck,
];
```

That is the whole interface. `run` is synchronous and takes nothing but facts, which is what makes it
`effort:low` to add one: a file with a pure function, a test with three literals, one line in the
array.

### 6.3 Worked example: stale prototype pins

Written against the types as they exist, because this check is fully supported today.

```ts
/**
 * A prototype version pinned to an entity version that is no longer the
 * entity's current one.
 *
 * `PrototypeMember` stores `entityVersionId` precisely so a playable
 * experiment does not follow its entities as they change; this check is the
 * other half of that bargain — the pin is correct, and someone should know the
 * world moved on. Draft prototype versions are the ones worth flagging: an
 * archived or already-playable version is a record of what was built, and its
 * pins are meant to be old.
 */
export const stalePrototypePinCheck: ConsistencyCheck = {
  id: 'stale-prototype-pin',
  title: 'Stale prototype pin',

  run({ entities, prototypeVersions }) {
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    const findings: CheckFinding[] = [];

    for (const version of prototypeVersions) {
      if (version.status !== 'draft') continue;

      for (const member of version.members) {
        const entity = byId.get(member.entityId);
        if (!entity?.currentVersionId) continue;
        if (entity.currentVersionId === member.entityVersionId) continue;

        findings.push({
          fingerprint: fingerprint('stale-prototype-pin', version.id, member.entityId),
          severity: 'warning',
          summary: `${entity.name} has changed since this prototype version pinned it.`,
          evidence: [
            {
              entityId: version.prototypeId,
              entityVersionId: member.entityVersionId,
              where: `Prototype version ${version.versionNumber}`,
              states: `pinned to an earlier ${entity.name}`,
            },
            {
              entityId: entity.id,
              entityVersionId: entity.currentVersionId,
              where: entity.name,
              states: 'has a newer current version',
            },
          ],
        });
      }
    }
    return findings;
  },
};
```

Note what is not there: no repository, no `await`, no project id threading, no status bookkeeping, no
"has this already been reported" query. The runner owns all of it.

Note also what the check does **not** do, which #72's wording invites: it does not say the pin is
*wrong*. #72 talks about "newer approved/current versions", but `ENTITY_STATUSES` is
`['draft', 'active', 'archived']` — there is no approval state in the model, so "current" is the only
thing that can be meant, and the summary says so rather than implying a judgement the data does not
support.

For contrast, `parameter-mismatch` against the same interface, once §7's prerequisite lands, is:
find `parameterReference` nodes in each document entity's content; resolve `entityId` to a mechanic
and `parameterId` through `readParameters`; compare `formatParameterValue(parameter)` with what the
node asserts; emit. Same signature, same purity, same size. The interface holds.

### 6.4 Why AI checks are a different type

The constraint is that deterministic and AI-assisted findings "must not share a code path that lets an
AI finding be presented as proven". The cheapest enforcement is not a review rule, it is the
signature above: **`ConsistencyCheck.run` is synchronous and receives no provider, so no
implementation of it can make a model call.** Nothing to audit.

An AI check is therefore a separate type, run by a separate pass:

```ts
export interface AiConsistencyCheck {
  id: string;
  title: string;
  /** Returns findings and the `Generation` that produced them; both, or neither. */
  run(facts: ProjectFacts, ai: AiCheckContext): Promise<AiCheckResult>;
}

export interface AiCheckResult {
  /** The generation record for the judgement, already completed. */
  generationId: string;
  findings: CheckFinding[];
}
```

The two producers write the same row. `origin` is set by the runner, not by the check, so a check
cannot claim to be the other kind. On the surface, deterministic findings use ordinary treatment and
AI-assisted findings use the AI purple `--lz-ai` that `CLAUDE.md` reserves exclusively for
AI/generative work — the repo's existing convention is what makes them "visibly distinguished", not a
bespoke badge.

---

## 7. What the first deterministic check can actually read

This is the section #88 asked for and the answer is not the one #72 assumes.

### 7.1 The parameter side is ready

`packages/domain/src/parameter/parameter.ts` gives a check everything it needs from the mechanic:

- `Parameter.id` is stable by construction, minted once by `parameterId(label, taken)` from the label
  and *"never recomputed, so renaming a parameter, reordering the list, or editing its bounds all
  leave it alone"*.
- `TUNING_PARAMETERS_KEY` is `'tuningParameters'`, and `readParameters(entity)` reads the list out of
  `entity.data` forgivingly — dropping unusable rows, carrying through out-of-bounds values as stored.
- `formatParameterValue(parameter)` renders the comparable string: `120 s`, `35%`, `On`, `Ironman`.

A check can prove what a mechanic says. That half is not the problem.

### 7.2 What a "structured/linked GDD reference" is today

A GDD is an `Entity` of type `document`; its body lives in `data.content` as TipTap JSON
(`DOCUMENT_CONTENT_KEY`), never rendered HTML. Two custom nodes can appear in that JSON, both defined
in `apps/web/src/features/entities/`:

| Node           | Name            | Attributes                          |
| -------------- | --------------- | ----------------------------------- |
| `EntityMention` | `entityMention` | `entityId`, `entityType`, `label`   |
| `EntityEmbed`   | `entityEmbed`   | `entityId`, `entityType`, `label`   |

Both take their attribute definitions from the same `referenceAttributes()` helper in
`entity-reference.ts`, and that helper defines exactly three: `entityId`, `entityType`, `label`. The
base extension set in `packages/ui/src/editor/editor-extensions.ts` adds StarterKit, task lists,
tables, images and Markdown import/export, and nothing else with an id in it. A repo-wide search for
custom TipTap nodes and marks returns those two plus three behavioural `Extension.create` calls
(`AiSuggestion`, `MarkdownPaste`, the slash menu), none of which store references.

### 7.3 The answer: the link does not exist

**No. There is no structured reference from document content to a mechanic parameter, and no way to
add one without changing the editor's node schema.**

The finest thing a GDD can point at today is an entity. `120 s` sitting in a paragraph next to an
`@Oxygen Management` mention is three unrelated text nodes and one atom node; nothing in the JSON says
the number is that mechanic's `base-oxygen-capacity` rather than a different parameter, a different
mechanic, or a coincidence. Connecting them is interpretation, which puts it on the AI-assisted side
by definition — and #72 requires the deterministic side to be *provable*.

Two secondary confirmations, since a link might have been hiding elsewhere:

- **The search index does not carry one.** `searchDocumentForEntity` flattens a document body with
  `documentPlainText(documentContent(entity))` into a `body` string. Structure is discarded on the way
  in; `SEARCH_SOURCE_TYPES` is `['entity', 'asset', 'generation']`, with no parameter-grained rows.
- **Nothing else in the tree reads a parameter out of a document.** Every non-test caller of
  `readParameters` is a mechanic editor, an entity embed's card, a version-compare column or the
  diffing code — never a document body.

### 7.4 What #72 needs first

A `parameterReference` inline node, built the way the two existing reference nodes are built — an
atom, in `apps/web/src/features/entities/`, attributes mirrored onto `data-*` so a copy/paste survives
the clipboard, a `/` command and an `@`-style picker to insert one. Its attributes:

```
entityId       the mechanic (or any entity carrying tuningParameters)
parameterId    the Parameter.id, stable for life
label          display text, read only when the reference cannot be resolved
```

That is one `effort:medium` issue, and it must land before any parameter-grained check can be written.
It should be filed as a dependency of #72, not folded into it.

### 7.5 Prevention beats detection, and it changes what the check is for

Here is the part worth pausing on. If a `parameterReference` renders the parameter's **current** value
— resolved on every render, exactly as `EntityMention` resolves a name so that *"renaming a character
updates every document that mentions it without a single document being rewritten"* — then the GDD and
the mechanic **cannot disagree**. There is no 120-versus-90 to detect, because the document does not
hold a number of its own.

That is a better outcome than the check #72 was going to build, and it is the outcome this repo's
architecture already argues for. It leaves two honest deterministic checks in the neighbourhood:

- **`broken-parameter-reference`** — a `parameterReference` whose `entityId` no longer resolves, or
  whose `parameterId` is not in that entity's `readParameters` output. That is a genuine, provable
  contradiction between a document and canonical data, it needs nothing but `readParameters`, and it
  is real: renaming a parameter is safe by design, deleting one is not.
- **Unlinked numbers stay AI-assisted.** "The tank lasts two minutes" against a 90 s parameter is
  interpretation, and it should be labelled as model analysis, with a `Generation` behind it.

The only way to keep a literal 120-versus-90 deterministic check is to let a `parameterReference` also
store the value the writer asserted, so a document can deliberately disagree with canon. That is a
product decision — *may a GDD state a number the mechanic does not?* — and it belongs to whoever files
the node issue, not to this document. If the answer is no, the check disappears and nothing is lost.

### 7.6 What this does to #72's scope

#72 is still buildable and its acceptance criteria are still reachable, but not with the check it
names first.

- **Deliverable today, no new infrastructure:** `stale-prototype-pin` (§6.3) and `duplicate-name`.
  Both are fully structured, both satisfy *"at least one deterministic structured-value contradiction
  is detected without AI"*, and the first also satisfies *"prototype stale-version checks account for
  exact pinned EntityVersions"* directly.
- **Blocked on a new prerequisite issue:** anything comparing a GDD statement to a parameter.
- **Note on `duplicate-name`:** provable only for exact matches after normalisation — same
  `entityType`, same case-folded, punctuation-stripped name, both non-archived. Embedding-based
  *near*-duplicates are not provable. `SearchDocumentRepository.searchSimilar` exists and is the right
  way to find candidates, but a cosine score is not a proof, so a near-duplicate finding is an
  AI-assisted finding: retrieval proposes the pairs, a `text.generate` judgement decides, and the
  finding carries that generation. Putting a similarity threshold on the deterministic side would be
  exactly the "AI finding presented as proven" the constraint forbids.

---

## 8. Where findings run

**A job.** A new `JOB_KINDS` member, `consistency_scan`, with `targetId = projectId`.

The evidence is `search_index`, which is the same shape of work and already made this decision:
`SearchIndexService.reindexProject` pages through every entity, asset and generation with
`MAX_PAGE_SIZE` at a time, and the comment on the class says the expensive half belongs in
`apps/worker` *"where every other long-running call already happens"*. A consistency scan loads at
least as much and then makes provider calls on top. It is not a request-time operation.

The mechanics, copied rather than invented:

- **Queued on demand only.** The Consistency surface has a "Run analysis" action; a `POST` enqueues.
  There is no write-triggered scan — `document-service.ts` autosaves, so a scan per entity change is a
  scan per keystroke burst. If a freshness problem shows up in use, a scheduled or debounced trigger
  is a later issue with a real requirement behind it.
- **Deduplicated like `requestReindex`.** Look for an existing `consistency_scan` job for the project
  in `ACTIVE_JOB_STATUSES` and return it rather than queueing a second. Two racing requests can still
  produce two jobs; the second finds the same answer, which is cheaper than serialising.
- **Steps, so the UI can say something honest.** `['Loading project', 'Deterministic checks', 'AI
  analysis']`, sized from a shared constant the way `GENERATION_JOB_STEPS` and `SEARCH_INDEX_JOB_STEPS`
  are — the API sizes the job from its length, the worker names each step as it reaches it.
- **Deterministic pass first, and it commits.** If the provider is down, the AI pass fails, `JobFailure`
  records why, and the deterministic findings are already written. The two passes are separate writes
  precisely so one can succeed alone.
- **Archived projects run nothing.** `requestReindex` already refuses for one; the same rule applies,
  and the refusal is ordinary rather than exceptional.

One thing the scan must **not** copy from `SearchIndexService.record`: swallowing errors. Indexing
failures are logged and ignored because the write that triggered them already succeeded and the index
is self-healing. A scan is the user's explicit request, and a failed scan must fail its job visibly.

---

## 9. AI provenance

**`Generation` is reused unchanged. No parallel mechanism, and no new fields on the generation row.**

The row already records everything #72 asks an AI finding to retain: `capability` (`text.generate`),
`provider`, `model`, `prompt`, `parameters`, `inputEntityIds`, `contextEntityIds`, `resolvedContext`
— *"the assembled project context exactly as it was sent, so provenance can say why each object was
included and not only that it was"* — plus `seed`, `providerRequestId`, timings and `failure`. That
`resolvedContext` disclosure is also, for free, the "show which project objects were included in
context" that #66 wants.

The link goes on the finding, not on the generation:

```ts
origin: 'deterministic' | 'ai_assisted';
/** Non-null exactly when `origin` is `ai_assisted`. */
generationId: string | null;
```

This follows the precedent set for accepted AI edits. `DOCUMENT_VERSION_GENERATION_KEY` puts the
generation id in the `EntityVersion`'s metadata rather than adding an output field to the
`Generation`, and the comment says why: *"keeping the link here rather than adding an output field to
the generation means the change is retained where it actually happened, and a suggestion the writer
rejected leaves no trace in the project at all."* A finding is the same — the generation records what
was asked, the finding records what came of it, and a judgement that produced nothing leaves a
`Generation` and no rows.

Two consequences to record so they are not mistaken for oversights:

- **`outputAssetIds` stays empty.** Text generations already work this way in this codebase; the
  result of a text generation lives on whatever consumed it.
- **Rescanning overwrites an AI finding's summary and `generationId`.** That is correct: the row is
  the latest scan. Every prior `Generation` is still on file and still queryable, so nothing about the
  history is lost — only the row's *current* explanation is replaced by the current one.
- **Embeddings are not generations.** `EmbeddingProvider.embed` is called directly by
  `SearchIndexService` and writes no `Generation`. That is fine here because retrieval is not the
  finding: the `Generation` behind an AI finding is the *judgement*, and the candidates retrieval
  surfaced are part of its `resolvedContext`.

---

## 10. The row, for whoever implements #72

Collecting the above into the shape the implementer needs. This is a description, not a schema — the
migration is #72's work, generated with `pnpm db:generate` after editing
`packages/database/src/schema`.

```ts
/**
 * One contradiction, as the last scan saw it.
 *
 * Derived, like `SearchDocument`, and rebuilt by every scan — with one
 * exception: `status`, `dismissedAt` and `dismissedBy` are the user's, and a
 * scan never overwrites them.
 */
export interface Finding {
  id: string;
  projectId: string;
  /** The `ConsistencyCheck.id` that produced it. */
  checkId: string;
  /** Stable across runs; unique with `projectId`. See §4. */
  fingerprint: string;
  origin: 'deterministic' | 'ai_assisted';
  /** Non-null exactly when `origin` is `ai_assisted`. */
  generationId: string | null;
  severity: FindingSeverity;
  summary: string;
  evidence: FindingEvidence[];
  status: 'open' | 'dismissed' | 'resolved';
  /** When the first scan reported this fingerprint. */
  firstSeenAt: Date;
  /** The scan that most recently reported it — the timestamp the surface shows. */
  lastSeenAt: Date;
  /** Set by the first scan that stopped reporting it. */
  resolvedAt: Date | null;
  dismissedAt: Date | null;
  dismissedBy: string | null;
  /** Optional note the dismissing user left. */
  dismissedReason: string | null;
}
```

- **Unique on `(projectId, fingerprint)`**, so a rescan is an upsert — the same key discipline as
  `unique('search_documents_source_key')`.
- **Indexes lead with `projectId`**, matching the note in `search-documents.ts`: *"Every read is
  scoped by project, so every index leads with it."*
- **`evidence[].entityId` carries no foreign key.** A finding must outlive the objects it names, the
  same reasoning `Activity.subjectId` and `Job.targetId` are documented with.
- **A finding must never cite objects from two projects.** This is structural rather than validated:
  `ProjectFacts` holds one project's records, so a pure check has nothing else to cite. The repository
  scopes by `projectId` like every other one here, and a test covers the crossover anyway because #72
  asks for it.

---

## 11. Follow-up

Issues to file, in the order they unblock things:

1. **Add a `parameterReference` node to the editor** (`effort:medium`). §7.4. Attributes `entityId`,
   `parameterId`, `label`; resolves the current value on render; a `/` command and a picker. Must
   settle whether a document may assert a value of its own (§7.5) — that answer decides whether a
   `parameter-mismatch` check exists at all. **A dependency of #72.**
2. **Rescope #72** to ship `stale-prototype-pin` and `duplicate-name` as its deterministic checks, and
   move the parameter comparison behind (1). Its acceptance criteria survive the change; its first
   example does not.
3. **Add `broken-parameter-reference`** (`effort:low`) after (1) — a reference whose entity or
   `parameterId` no longer resolves.

Also noted, and deliberately not acted on here:

- `docs/README.md` lists the contents of `docs/decisions/` and does not yet list this file. It is a
  shared file and several decision documents are being written at once, so it should be updated in one
  pass rather than by each of them.
- Neither `docs/design/page-by-page-ux-spec.md` nor the design system spec describes a Consistency or
  Design Review surface — a search of both for "consisten" finds only unrelated uses. #72's UI has no
  design reference to build against, and should either get one or be explicit that it is composing
  existing components (panels, status badges, empty states) without a new spec.

---

## Appendix A — how the code evidence was obtained

Read from the working tree at `72dc538` on 2026-09-09. Nothing below was inferred from documentation.

| Claim                                                              | Source                                                                                                                       |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Parameter ids are stable; `readParameters`; `formatParameterValue` | `packages/domain/src/parameter/parameter.ts`                                                                                  |
| A GDD body is TipTap JSON in `data.content`                        | `packages/domain/src/document/document.ts` (`DOCUMENT_CONTENT_KEY`, `DocumentContent`)                                        |
| The only reference attributes are `entityId`/`entityType`/`label`  | `apps/web/src/features/entities/entity-reference.ts` (`referenceAttributes`), `entity-mention.tsx`, `entity-embed.tsx`        |
| The base extension set adds no reference node                      | `packages/ui/src/editor/editor-extensions.ts`                                                                                 |
| Only two custom nodes exist repo-wide                              | `grep -rn "Node.create\|Mark.create\|Extension.create" packages apps --include="*.ts" --include="*.tsx"` — 7 hits, 2 are nodes |
| Documents have no stable block address                             | `apps/web/src/features/gdd/document-outline.ts` (headings located by text and reading order)                                  |
| The index stores flattened text, not structure                     | `packages/domain/src/search/search-document.ts` (`searchDocumentForEntity`, `SEARCH_SOURCE_TYPES`)                            |
| Nothing reads a parameter out of a document                        | `grep -rn "readParameters" packages apps` — all non-test callers are editors, cards, compare columns                          |
| `SearchDocument` is a derived, upserted row                        | `packages/domain/src/search/search-document.ts`; `packages/database/src/schema/search-documents.ts`                           |
| Project-wide work is a job; `search_index` is the precedent        | `packages/domain/src/job/job.ts` (`JOB_KINDS`), `packages/domain/src/search/search-index-service.ts` (`requestReindex`)       |
| Pins are `entityVersionId`; entities carry `currentVersionId`      | `packages/domain/src/prototype/prototype-version.ts` (`PrototypeMember`), `packages/domain/src/entity/entity.ts`              |
| There is no "approved" entity status                               | `packages/domain/src/entity/entity.ts` (`ENTITY_STATUSES`)                                                                    |
| `Generation` holds prompt, provider, context and `resolvedContext` | `packages/domain/src/generation/generation.ts`                                                                                |
| Generation links are recorded on the consumer, not the generation  | `packages/domain/src/document/document.ts` (`DOCUMENT_VERSION_GENERATION_KEY`), `apps/web/src/features/gdd/ai-edit-version.ts` |
| Embeddings write no `Generation`                                   | `packages/domain/src/search/search-index-service.ts` (`embedPending`)                                                          |
| Semantic candidate retrieval exists                                | `packages/domain/src/search/search-repository.ts` (`searchSimilar`), `search-service.ts` (`searchSemantic`)                    |
| `Activity` is authoritative history, by contrast                   | `packages/domain/src/activity/activity.ts`                                                                                     |
| Severity tones                                                     | `packages/ui/src/status-badge.tsx` (`StatusTone`)                                                                              |
| No Consistency surface in the design specs                         | `grep -rn -i "consisten" docs/design/*.md` — no hits describing such a screen                                                  |
