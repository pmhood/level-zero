# How a GDD section is addressed

**Status:** decided in #185. Blocks #186, #187, #188. This document implements nothing.

Every claim below about what the code does was read from the tree at **`6e163f4`** on
**2026-09-16**. The files are listed in [Appendix A](#appendix-a--how-the-code-evidence-was-obtained);
where this document says "today", it means that commit.

The headline, before the reasoning: **a section is a top-level heading node in the stored TipTap
JSON, carrying a minted `sectionId` attribute that is written once and never recomputed. That id is
the whole of `ReviewTarget.anchor`.** Numbering and the Appendices group are presentation, derived
from reading order on every render. "+ Add Section" inserts a heading and nothing else — no row, no
record, no second list. An anchor whose id is no longer in the document is **orphaned**, which is a
thing computed on read rather than a column anybody writes, so restoring a version brings its
comments back with it. And §4.2 of [`consistency-findings.md`](consistency-findings.md) still holds:
a heading's *position* remains inadmissible in a fingerprint; a minted `sectionId` is an identity,
not a position, and is admissible on exactly the terms §4.3 already grants `parameterId`.

---

## 1. Why this exists

Three features were split out of #167 that all need the same missing answer. #186 wants a table of
contents that numbers, groups and adds sections. #187 wants the four section statuses the UX spec
names — Draft, Review, Approved, Stale — and comment threads attached to a section. #188 wants to
notice that a section went out of date because an entity it mentions changed.

None of them can be built on what exists. `documentOutline` finds headings by filtering the
document's top-level nodes and returning their text and level; the panel scrolls to the *n*th `h1,
h2, h3` in the DOM. Nothing there survives someone typing a new heading above it. `ReviewTarget`
already carries an `anchor` documented as "a stable address inside the target — a GDD section
heading", and its own comment admits the address does not exist yet: *"there is no addressable block
inside a document ... so what counts as an anchor is the caller's to decide."* #185 is the caller
deciding.

The decision is not recoverable later. Anchors are stored strings; once comments and approvals are
written against one scheme, changing the scheme means rewriting them, and the rewrite has to guess
which heading each old anchor meant — which is the same problem that made the old scheme unusable.

---

## 2. The five answers

| #   | Question                         | Decision                                                                                                                                                                                      |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | What addresses a section         | **A minted `sectionId` attribute on the top-level heading node**, opaque, written once, never recomputed. The anchor is that id and nothing else — no prefix, no path, no text.                |
| 2   | Rename, move, delete, demote     | **Rename, move and demote are invisible**: the id travels with the node, so the thread and the status are untouched. **Delete orphans**: the rows stay, the anchor stops matching, and the GDD shows them against the document under "Removed sections". Orphaning is computed, never stored, so a version restore un-orphans them. |
| 3   | Appendices and numbering         | **Presentation.** Both are derived from reading order on every render. The appendix group is the run of top-level sections from a level-1 heading reading `Appendices` to the end of the document. Nothing about either is stored. |
| 4   | What "+ Add Section" inserts     | **A heading and an empty paragraph.** No record is created; the section exists because the heading does, and it reads as `draft` because no decision names it.                                 |
| 5   | Does §4.2's exclusion still hold | **Yes, amended by reference.** Heading text, level, path and ordinal stay out of fingerprints. A minted `sectionId` goes in, for the reason §4.3 admits `parameterId`.                         |

Nothing here needs a migration, a new table, or a change to `comments.target_anchor` or
`review_decisions.target_anchor`. Both columns are already `text`, already nullable, already matched
exactly. §9 is the whole diff.

---

## 3. What addresses a section

### 3.1 The three candidates

**Heading text.** `anchor = 'Core Loop'`. It is free, it is readable in a database row, and it is
what `documentOutline` already returns. It is also wrong the first time anybody edits a heading,
which in a GDD is constantly: the mockup's twelve section titles are exactly the kind of prose that
gets tightened in review. A renamed heading would silently strand its own comments, and two sections
both called "Overview" would share a thread.

**A heading path.** `anchor = 'Gameplay & Controls/Movement'`. It survives a sibling being renamed
and nothing else. It breaks on rename, on promote and demote, and on reorder, and it violates "stored
and matched, never parsed" by construction — a path is a structure, and the first bug fix will be a
`split('/')`.

**A minted id on the heading node.** `anchor = '9f2c…'`. It survives everything a writer does to the
prose, because it is not made of the prose. Its cost is that TipTap nodes in this codebase start
carrying ids, which #167 explicitly told us not to do *unless another established feature requires
it* — and then made section status that feature.

### 3.2 The decision

**A minted id on the heading node.**

- Heading nodes gain one attribute, `sectionId`, a UUID. It renders as `data-section-id` so the
  attribute survives a copy and paste inside the editor, and is dropped by Markdown export, which has
  nowhere to put it.
- It is written once, when a heading first appears without one, and **never recomputed**. Editing the
  heading's text does not touch it. Changing its level does not touch it. Moving the node does not
  touch it, because it is on the node.
- The anchor is the bare id. No `section:` prefix: `ReviewTarget.anchor` is *"stored and matched,
  never parsed"*, and a prefix is an invitation to parse. A document-level comment already has a
  distinct representation — `anchor` is null — so there is nothing for a prefix to disambiguate.
- A section is a **top-level** heading node, the same set `documentOutline` already returns. A
  heading inside a table cell or a blockquote is not a section and gets no id.

Only `document` entities get the domain's minting pass (§3.3), but the editor is one editor, so a
heading typed into a character's background gets an id too and nothing reads it. That is harmless,
and it is cheaper than making `createEditorExtensions` conditional — the module's own comment says
why a surface should not get a different extension set from its neighbours.

### 3.3 Where it is minted, and why that is two places

The rule is one rule, and it runs in two representations because there are two writers.

**The editor mints as you type.** A ProseMirror `appendTransaction` on the heading extension walks
top-level headings in reading order after any document-changing transaction, gives an id to any
heading without one, and re-mints any id it has already seen in that pass. This is not an
optimisation; it is what makes the ids stable at all. `use-editor-autosave.ts` posts the whole body on
a debounce and `gdd-workspace.tsx` never reloads content behind the writer — deliberately, and the
extension set's own comment says so. If the ids were minted only on the server, every autosave would
send id-less headings, the server would mint fresh ones, and every anchor written before the last
save would point at nothing.

**The domain mints for everything else.** `assignSectionIds(content, ids)` applies the same rule to
stored JSON, and is called by `DocumentService.create` and `DocumentService.saveContent`. Its real
callers are the writers that never touch an editor: #189's seeded starting structure, an import, a
script, a test. For editor traffic it is a no-op, and if it ever is not, the client and the server
have drifted and the next load fixes it.

Two implementations of a three-line rule is duplication this document accepts on purpose. The
alternative — serialising the document to JSON on every keystroke so the domain function can run —
costs more than it saves, and the rule is small enough to state twice and test twice. What is *not*
duplicated is the read side: `documentSections(content)` lives in the domain and is the one answer to
"which sections does this document have", used by the web app, by #186's outline and by #188's check.

Documents written before this lands have no ids. They are not backfilled by a migration. Opening one
in the editor mints them, minting is a document change, and a document change autosaves — so a legacy
document costs one extra save the first time somebody opens it, and is normal from then on. That save
shows up in `compareVersions` as `contentChanged` once; `documentBlocks` compares prose, so no reader
sees it.

### 3.4 What stops two sections sharing an id

Copy a section and paste it below; split a heading in two with Enter; duplicate a whole document's
worth of content. All three hand ProseMirror a second node with the same attribute.

The rule, in both places: **walking in reading order, the first heading to use an id keeps it, and any
later heading using the same id is re-minted.** First in reading order is not arbitrary — it is the
one existing anchors were written against, so the section that keeps its comments is the section that
had them. A split leaves the original section with its thread and its status, and the new one
starting at Draft, which is what a writer splitting a section in two means.

Uniqueness is only required **within one document**, because an anchor is only ever matched inside a
`(targetType, targetId, anchor)` triple and `targetId` is the document entity's id. A section pasted
into a second document therefore keeps its id and gains nothing: the threads stay on the document
they were written about. That is the right answer, and it falls out of the existing filter rather than
needing a rule.

### 3.5 Alternatives considered

**A readable slug, minted from the heading text like `parameterId`.** Genuinely tempting: it is the
repo's own precedent, it needs no id generator, it makes a database row legible, and — because
`parameterId` re-adopts a deleted parameter's id when the label comes back — a retyped heading would
recover its comments. It fails on when the minting happens. A parameter is born from a form with a
finished label; a heading is born one keystroke at a time, so the label at minting time is `C`, and
`c` is the anchor that section keeps for life. Making it wait for the heading to "settle" means
defining settled, which is more machinery than an opaque id costs. Readability was the entire
argument, and it does not survive.

**A parallel section record** — a `gdd_section` row, or a `section` entity, holding a title, an order
and a status, with the prose beneath it. This is what "numbered, grouped and addable is a structure"
invites. It is rejected three times over: #185's own scope says TipTap JSON stays canonical; #187's
scope says a `gdd_section_status` table is the wrong answer; and it is the exact shape the
architecture rules call out — *"duplicating entity identity in a feature-specific store is the exact
thing this architecture exists to prevent"*. It also has to answer what happens when somebody deletes
the heading but not the record, which is a synchronisation problem this design does not have.

**Server-only minting, with the client reloading the saved body.** One implementation instead of two,
at the price of replacing editor content underneath a writer mid-sentence. `use-editor-autosave` and
`createEditorExtensions` both carry comments explaining that undo history must survive autosave and
that nothing reloads content behind the writer. Rejected on their evidence, not on taste.

**A ProseMirror step-mapped position.** Exact while the editor is open and meaningless the moment it
is closed. An anchor has to survive in a database row read by a worker job.

### 3.6 The strongest argument against

**This puts ids in the creative content, and the content is the thing we promised to keep clean.**
Every stored GDD now carries opaque tokens a human reading the JSON did not write, an AI model
rewriting a section will happily invent or drop, and an import has no idea about. §4.2 said there was
nothing stable inside a document, and the honest reading of that is not "so mint something" but "so
do not address inside a document at all".

The answer is that the alternative to addressing sections is not a simpler design; it is #187 and
#188 being cancelled, and the UX spec's four section statuses being marked unbuildable. They are
specified, they are what makes a GDD a reviewed document rather than a text file, and #167 already set
the test — *avoid persistent block identity unless another established feature explicitly requires
it* — with the requirement now met.

What the argument does earn is the containment in §3.4 and §5.3: exactly one attribute, on exactly
one node type, never parsed, never displayed, and safe to lose. A section whose id an AI edit dropped
is re-minted on the next pass and reads as a new section — its old thread orphans and stays visible,
rather than the document failing to load.

---

## 4. What a section is, exactly

Implementable definitions, because #186, #187 and #188 each need the same one:

- A **section** is a top-level `heading` node with a `sectionId`. `documentSections(content)` returns
  `{ id, level, text }` for each, in reading order.
- A section's **extent** is the top-level nodes after its heading, up to the next heading **of any
  level**. A subsection does not belong to its parent's extent.
- A section's **referenced entities** are the entity mentions and embeds inside its extent — what
  `referencedEntityIds` already reads, scoped to those nodes. This is the input #188 needs.

The "any level" rule is the one that could sensibly have gone the other way. Making a parent's extent
swallow its subsections would mean an entity mentioned in 3.2 makes both 3 and 3.2 stale, which is two
findings about one sentence and two sections to re-approve. Nesting stays what it looks like — an
outline relationship — and staleness stays local to the section whose prose actually mentions the
thing that moved.

---

## 5. What happens to an anchored comment or decision

### 5.1 Matching

Unchanged from what is already built: exact string equality. `reviewTargetFilter` produces
`{ targetType, targetId, anchor }`, `comment-repository.ts` turns a null anchor into `is null` and a
string into `eq(comments.targetAnchor, filter.anchor)`, and `ReviewTargetResolver` resolves the
*target* — the document entity — without ever looking at the anchor. Nothing parses, normalises, trims
or case-folds an anchor, and nothing should start.

An anchor is **live** when `documentSections(content)` contains its id, and **orphaned** when it does
not. That is the only new concept, and it is a predicate over the current body, not a state anybody
writes.

### 5.2 The behaviour, event by event

| What the writer does                             | The `sectionId`                                       | The comments and decisions anchored to it                              |
| ------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Renames the heading (`Core Loop` → `The Loop`)   | unchanged — it is not made of the text                | untouched: same thread, same status, no notification, no re-review     |
| Moves the section (cut and paste, reorder, drag) | unchanged — it rides on the node                      | untouched; only the derived number changes                             |
| Promotes or demotes it (`h2` → `h3`)             | unchanged — level is presentation                     | untouched; the outline nests it differently                            |
| Splits it in two                                 | first in reading order keeps it; the second is minted | stay with the first; the new section is Draft with no threads          |
| Merges two (deletes the second heading)          | the survivor keeps its own                            | the survivor's are untouched; the deleted heading's orphan             |
| Deletes the section                              | leaves the document                                   | **orphaned.** Nothing is deleted, edited or re-pointed                 |
| Restores a version that still has that heading   | comes back with the content                           | **live again, automatically** — the anchor matches once more           |
| Pastes the section into another document         | travels with the node                                 | do not follow: they are matched under the first document's `targetId`  |
| An AI edit rewrites the heading and drops the id | re-minted by the next pass                            | orphaned; visible under "Removed sections" rather than lost            |

Every row of that table is a test, and every one of them is a test over `documentSections` plus a
filter — no editor, no database.

### 5.3 Orphaned is a view, not a column

Deleting a section **writes nothing**. There is no cleanup job, no `orphanedAt` column, no migration
that walks anchors, and no service call that re-points a comment at another section.

This is the same posture `consistency-findings.md` §5 takes with staleness — *"displayed, not
invalidated"* — and it is what makes the restore case work for free. It also matches what the review
layer already does with a target that has gone: `ReviewTargetResolver.resolve` is *"forgiving on
purpose ... a comment whose target has gone is still a comment worth rendering"*, and
`ReviewStatus.target` is null rather than an error. An orphaned anchor is the same fact one level
down.

An orphan is therefore reversible by undo or by restoring a version. It is *not* reversible by
retyping the heading: a retyped heading gets a fresh id and does not recover the old thread. That is
the price of §3.5's opaque id over a slug, it is stated here so #187 does not promise otherwise, and
version restore covers the case a writer actually notices.

### 5.4 What an orphan looks like on screen

Concretely enough for #187 to build and to test:

- **Orphaned threads** are listed in the document inspector in a group headed **Removed sections**,
  below the live sections' threads, oldest first. Each reads as a normal thread — author, body,
  replies, resolve and reopen all work — under a line saying the section it was written about is no
  longer in the document. It does not name that section, because nothing stored its name: the thread's
  own first comment is what identifies it, which is the same bargain `Activity` makes by storing its
  summary verbatim.
- **Orphaned decisions** contribute to no section's status and never to the document's. They appear in
  the document's review history, which is already "every decision about the target, newest first",
  labelled as belonging to a removed section.
- **The document's own status** — `anchor: null` — is untouched by all of this.
- **Nothing is offered that re-points an orphan at a live section.** It would need the writer to pick
  the right one, and it would be the only operation in the review layer that edits a stored target.

### 5.5 An anchored judgement is not pinned to a document version

The one change this decision forces in the existing review domain, and #187 would get it wrong
otherwise.

`pinJudgement` today pins any `approved` or `rejected` decision to the target's `currentVersionId`,
and `resolveReviewState` then reports the target as `draft` again with a `staleDecision` as soon as
that version is superseded. For a document target that is right: approving *the GDD* means approving
the GDD as it stood. For a section it is wrong. Document versions are whole-document snapshots —
`snapshot` commits the entity — so one milestone snapshot taken after editing section 5 would
unapprove all twelve sections at once, and the resulting wall of false Stale would bury the real one
#188 is being built to raise.

So: **`pinJudgement` returns the target unchanged when `target.anchor` is non-null.** A section's
status is simply its newest decision. Document-level review is unaffected and keeps pinning exactly as
it does now.

The alternative considered was to keep the pin and have #187 compare the section's own prose between
the pinned `EntityVersion`'s snapshot and the current body, reporting Stale only when *that* section
changed. It is well defined and needs no new storage — the pinned version holds the whole body, ids
included, so the comparison is `documentSections` twice. It is not built now because nobody asked for
it: the spec's Stale is *"if canonical entity data changes"*, which is #188's, and #187's scope says
Stale is not a fifth `ReviewState`. It is recorded here because the pinned version plus a stable
`sectionId` are exactly what a later "edited since approval" check would need, and neither has to be
added for it.

---

## 6. Numbering and Appendices are presentation

`docs/mockups/gdd-workspace.png` shows a table of contents numbered 1–12, a separate **Appendices**
group lettered A–C, and the same numbers rendered as badges beside the headings in the document. None
of it is stored.

- **Numbering** is computed from reading order over `documentSections`, respecting nesting: level-1
  sections are 1, 2, 3…, a level-2 section under section 3 is 3.1, and so on. The editor offers h1–h3,
  so the outline shows three levels.
- **The appendix group** begins at the first level-1 section whose trimmed text is `Appendices` or
  `Appendix`, case-insensitively, and runs to the end of the document. That heading labels the group
  and takes no number; the level-1 sections after it are lettered A, B, C. Sections before it are
  numbered 1..N as usual. No such heading, no group.
- Both live with the outline, in `apps/web/src/features/gdd/document-outline.ts`, and are recomputed
  on every render. Neither is ever sent to the API or written into the body.

The alternative was an `appendix: true` attribute beside `sectionId`. It is rejected because it is
invisible persistent state: a writer cannot see it, cannot toggle it without a control built for the
purpose, and a paste would carry it into a document that has no appendices. A magic heading is a
convention a writer can read, edit and undo with the keys they already have — and it is a convention
the mockup itself already displays as a heading.

The cost is real and should not be hidden: a project that wants its appendices called "Reference
Material" does not get a lettered group. That is one heading's worth of inconvenience against a
persistent flag nobody can see, and #186 may put the word into the "+ Add Section" affordance if it
wants the convention to be discoverable.

---

## 7. What "+ Add Section" inserts

**A level-1 heading with a freshly minted `sectionId`, an empty paragraph after it, and the caret in
the heading.** Nothing else — no row, no API call, no record.

- The heading's text starts empty. `documentOutline` already keeps untitled headings deliberately,
  *"so the entry a writer is part-way through typing does not make the list jump around"*, and renders
  them as "Untitled section" today.
- It is inserted at the end of the document, or immediately **before** the appendix group when there
  is one — otherwise the new section lands among the appendices and is lettered D.
- The new section reads as **Draft**, because `resolveReviewState` returns `draft` for a target with no
  decisions. That is what satisfies #187's "a document with no decisions reads as Draft rather than as
  blank": it is already true, for free, and needs no seeding.
- Both affordances in the mockup — the `+` in the table-of-contents header and the "+ Add Section"
  button beneath it — are this one action.

The section is addressable the instant the editor mints its id, which is the same transaction, so a
writer can add a section and comment on it before the first autosave lands.

---

## 8. Whether §4.2's exclusion still holds

Yes, and it is amended by one sentence rather than reinterpreted.

`consistency-findings.md` §4.2 excludes **document positions** from fingerprints, and gives the
reason: *"There is nothing stable to use. TipTap nodes in this codebase carry no ids;
`documentOutline` locates a heading by its text and its place in reading order, both of which move
when someone types above it."* Every word of that remains true of positions. Heading text, heading
level, a heading path and an ordinal are still inadmissible, and #188 must not reach for any of them.

A `sectionId` is not a position. It is an identity that survives exactly the movements §4.2 objects to
— typing above it, renaming it, demoting it — which is the property the exclusion was protecting. §4.3
already admits one such id into a fingerprint for the same reason: *"`parameterId` is safe to use here
because `parameter.ts` is explicit that it is minted once and never recomputed — renaming a parameter,
reordering the list, or editing its bounds all leave it alone."* Substitute "heading" for "parameter"
and the sentence is this decision.

So #188's check can fingerprint on the section:

| Check           | Parts, in order                                        |
| --------------- | ------------------------------------------------------ |
| `stale-section` | `checkId`, `documentEntityId`, `sectionId`, `entityId` |

and it inherits the properties §4.2 was defending. Editing the section's prose does not churn it.
Renaming the heading does not churn it. Reordering the document does not churn it. Deleting the section
makes the check stop producing the fingerprint, and the row resolves like any other — §5's third
consequence, *"a finding whose cited object was deleted is not special"*, covers it unchanged. The one
case that does mint a new fingerprint, and so abandons a dismissal, is a section deleted and retyped;
that is the same trade §3.5 accepts, and it is rarer than the tuning pass §4.2 was written to survive.

§4.2 in `consistency-findings.md` has been amended in place with a pointer to this document. Nothing
else in that decision changes: findings stay computed-and-upserted, dismissal stays authoritative, and
no value, version id or model prose enters a fingerprint.

---

## 9. The concrete diff this authorises

Nothing here is built by #185. This is what #186, #187 and #188 may build without re-deciding anything.

**`packages/domain/src/document/` — a new `document-section.ts`, exported from `src/index.ts`:**

```ts
/** Attribute a heading node carries its section identity in. */
export const DOCUMENT_SECTION_ID_ATTR = 'sectionId';

/** One addressable section: its minted id, its heading level, its heading text. */
export interface DocumentSection {
  id: string;
  level: number;
  text: string;
}

/** The document's sections, in reading order. Top-level headings without an id are skipped. */
export function documentSections(content: DocumentContent): DocumentSection[];

/** Mints ids for headings without one and re-mints duplicates, the first occurrence keeping it. */
export function assignSectionIds(content: DocumentContent, ids: IdGenerator): DocumentContent;
```

`assignSectionIds` returns its argument unchanged when it changes nothing, so autosave does not write a
new object on every keystroke.

**`packages/domain/src/document/document-service.ts`:** a third constructor argument,
`ids: IdGenerator`, and a call to `assignSectionIds` in `create` and in `saveContent`.
`apps/api/src/domain/domain.module.ts` passes `uuidIdGenerator`, which it already imports.

**`packages/domain/src/review/review-decision.ts`:** `pinJudgement` returns the target unchanged when
`target.anchor !== null` (§5.5).

**`packages/domain/src/review/` — one new read on each port**, because listing a document's section
threads by exact anchor is impossible when the orphans are the ones you cannot name:

```ts
// CommentRepository
/** Every comment on the target with a non-null anchor, replies included, oldest first. */
listAnchoredByTarget(
  projectId: string,
  targetType: ReviewTargetType,
  targetId: string,
): Promise<Comment[]>;

// ReviewDecisionRepository
/** The target's decisions with a non-null anchor, newest first. */
listAnchoredByTarget(
  projectId: string,
  targetType: ReviewTargetType,
  targetId: string,
): Promise<ReviewDecision[]>;
```

A second method, rather than a third meaning for `ReviewTargetFilter.anchor`: that field already
distinguishes `null` (the whole target) from a string (one section), and adding "absent means any" puts
a load-bearing difference between `undefined` and `null` through a DTO layer, which is a bug waiting
for a serialiser.

**Services and endpoints.** Both anchored reads are per-target, so they sit beside the existing ones:

| Layer  | Addition                                                                                                                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain | `CommentService.listAnchoredThreads(projectId, target): Promise<CommentThread[]>` — each thread's own `target.anchor` says which section it is on                                                   |
| Domain | `ReviewService.listAnchoredStatuses(projectId, target): Promise<AnchoredReviewStatus[]>`, where `AnchoredReviewStatus` is `{ anchor, state, decision }` — one `resolveReviewState` per anchor group |
| API    | `GET /projects/:projectId/comments/anchored?targetType=entity&targetId=<documentId>`                                                                                                               |
| API    | `GET /projects/:projectId/reviews/anchored?targetType=entity&targetId=<documentId>`                                                                                                                |
| Web    | `listAnchoredCommentThreads` and `listAnchoredReviewStatuses` in `apps/web/src/lib/api.ts`, beside their exact-anchor siblings                                                                      |

`AnchoredReviewStatus` has no `staleDecision`: after §5.5 an anchored judgement is never pinned, so one
can never go stale. The write paths need no change at all — `RecordReviewDecisionDto`,
`CreateCommentDto` and `ReviewTargetParams` already carry `anchor` end to end.

**`packages/ui/src/editor/` — a new `section-id.ts`**, a heading extension adding the `sectionId`
attribute (rendered as `data-section-id`) and the `appendTransaction` that mints it, included
unconditionally in `createEditorExtensions`.

**`apps/web/src/features/gdd/document-outline.ts`:** `documentOutline` reads `documentSections` and adds
numbering, the appendix group, and the id each entry addresses — #186's work, and the reason its
jump-to can stop counting DOM nodes.

**Storage:** nothing. No migration, no new table, no column. `comments.target_anchor` and
`review_decisions.target_anchor` are nullable `text` today, and the existing
`(project_id, target_type, target_id)` indexes already serve the anchored reads.

---

## 10. What this does not decide

- **How a section's status is rendered.** Badge, tone and placement in the outline are #187's, against
  the design system's existing status badges.
- **What `stale-section` actually compares.** This document gives #188 a fingerprint and a definition of
  a section's referenced entities; whether "changed" means `currentVersionId` or `updatedAt`, and what
  the evidence reads like, are its own.
- **Reordering sections by dragging the outline.** #186 asks whether it is now possible. It is — moving
  a heading and its extent is an editor operation and the ids ride along — but the interaction is
  #186's to design, and this document takes no position on whether it belongs in that issue's scope.
- **Anything about anchors on non-document targets.** `ReviewTarget.anchor` stays what its comment says:
  the caller's to decide. This decides it for `document` entities only. An anchor on an asset or a
  prototype version remains unused and unspecified.
- **`ReviewTarget.anchor`'s doc comment**, which still says there is no addressable block inside a
  document. #187 should correct it to point here when it wires the first anchored thread.

---

## Appendix A — how the code evidence was obtained

Read from the working tree at `6e163f4` on 2026-09-16. Nothing below was inferred from documentation.

| Claim                                                                  | Source                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Headings are located by text and reading order, top-level nodes only   | `apps/web/src/features/gdd/document-outline.ts`                                                                   |
| Untitled headings are kept deliberately                                | `apps/web/src/features/gdd/document-outline.ts` (`documentOutline` comment)                                       |
| `anchor` is "stored and matched, never parsed"; 200 characters         | `packages/domain/src/review/review-target.ts` (`ReviewTarget`, `MAX_REVIEW_TARGET_ANCHOR_LENGTH`)                 |
| A document is an `entity` target, not a fourth target type             | `packages/domain/src/review/review-target.ts` (`REVIEW_TARGET_TYPES` comment)                                     |
| Anchor matching is exact, with `is null` for the whole target          | `packages/database/src/repositories/comment-repository.ts`                                                        |
| There is no listing that spans anchors                                 | `packages/domain/src/review/comment-repository.ts`, `review-decision-repository.ts` (`listByTarget` only)         |
| A reply inherits its parent's target, anchor included                  | `packages/domain/src/review/comment-service.ts` (`reply`)                                                         |
| No decisions recorded means `draft`                                    | `packages/domain/src/review/review-decision.ts` (`resolveReviewState`)                                            |
| Judgements are pinned to `currentVersionId`                            | `packages/domain/src/review/review-decision.ts` (`pinJudgement`)                                                  |
| A target that no longer resolves is rendered, not errored              | `packages/domain/src/review/review-target-resolver.ts` (`resolve`), `ReviewStatus.target`                         |
| `target_anchor` is nullable `text`; the index is `(project, type, id)` | `packages/database/src/schema/reviews.ts`                                                                         |
| An anchor is a caller-owned label matched exactly — existing precedent | `packages/database/src/schema/selections.ts` (`purpose`)                                                          |
| A GDD body is TipTap JSON in `data.content`; only `doc` is constrained | `packages/domain/src/document/document.ts` (`DOCUMENT_CONTENT_KEY`, `DocumentContent`)                            |
| Autosave writes the body and no version; snapshots are deliberate      | `packages/domain/src/document/document-service.ts` (`saveContent`, `snapshot`)                                    |
| `DocumentService` has no id generator today                            | `packages/domain/src/document/document-service.ts` (constructor), `apps/api/src/domain/domain.module.ts`          |
| Versions are compared as prose blocks, not serialised JSON             | `packages/domain/src/document/document.ts` (`documentBlocks`)                                                     |
| Plain-text extraction reads `text` nodes only, never attributes        | `packages/domain/src/document/document.ts` (`documentPlainText`)                                                  |
| Headings are h1–h3; custom nodes arrive through `extensions`           | `packages/ui/src/editor/editor-extensions.ts`                                                                     |
| Nothing reloads content behind the writer                              | `packages/ui/src/editor/editor-extensions.ts` (StarterKit comment), `packages/ui/src/editor/use-editor-autosave.ts` |
| `packages/ui` already depends on `@level-zero/domain`                  | `packages/ui/package.json`                                                                                        |
| Parameter ids are minted once from a label and never recomputed        | `packages/domain/src/parameter/parameter.ts` (`parameterId`)                                                      |
| Fingerprints exclude document positions; `parameterId` is admitted     | `docs/decisions/consistency-findings.md` §4.2, §4.3                                                               |
| Findings are displayed rather than invalidated; deleted subjects resolve | `docs/decisions/consistency-findings.md` §5                                                                     |
| Section status is Draft / Review / Approved / Stale                    | `docs/design/page-by-page-ux-spec.md` §GDD                                                                        |
| Twelve numbered sections, Appendices A–C, "+ Add Section"              | `docs/mockups/gdd-workspace.png`                                                                                  |
