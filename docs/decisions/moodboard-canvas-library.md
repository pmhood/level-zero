# Moodboard canvas: freely licensed alternatives to tldraw

**Status:** decided in #61 — **the §8 recommendation below was rejected**. Rotation was judged
non-negotiable, so the Moodboard canvas was rewritten as the plain DOM/SVG implementation of §5.5
rather than on React Flow. The analysis is kept as written, including the recommendation it
reached, because the argument that overturned it is §8's own "strongest argument against".

Investigated for issue #59; the Moodboard canvas itself was built in #46.

All licence text, version numbers, bundle sizes and repository activity below were checked on
**2026-09-09**. Sources are listed in [Appendix A](#appendix-a--how-the-numbers-were-obtained).

---

## 1. Why this exists

`docs/design/frontend-design-system-and-implementation-spec.md` §1 lists tldraw as the sanctioned
library for the "moodboard / freeform canvas", and #46 built the canvas on it. tldraw is not open
source, and its current licence does not merely ask for attribution — it **prohibits production use
outright** without a paid key.

The failure mode is the bad kind. Everything works on `localhost`; the first deploy to a real
domain logs errors and stops rendering.

Two facts make this cheaper to act on than it first appears:

- **#46 is not merged.** At the time of writing, `apps/web/src/features/moodboards/` exists only on
  the `issue-46-build-the-moodboard-canvas` branch, and issue #46 is open and labelled `on-hold`.
  There is no shipped canvas and no board data in the wild. A swap is a diff on an unmerged branch,
  not a data migration.
- **The board's own model is already engine-agnostic.** See §3.

---

## 2. What "free" means here

The bar this document holds candidates to, taken from the issue:

- A permissive or copyleft OSS licence — MIT, Apache-2.0, BSD, MPL, LGPL — with **no paid key, no
  watermark, no seat count, and no usage-based term** for commercial production use.
- Not a "free for now" source-available licence that converts on revenue or headcount.
- The exact licence, verified against the licence **text** for the version that would actually be
  pinned — not a README badge or a pricing page.

---

## 3. What the Moodboard actually needs

These requirements are read out of `apps/web/src/features/moodboards/` on the #46 branch. The code
is the specification; the wishlist in #46's issue body is not.

### 3.1 The shape of the feature

Thirteen files, 2,539 lines. **Only three import tldraw**, totalling 626 lines:

| File | Lines | Imports tldraw |
| --- | --- | --- |
| `moodboard-canvas.tsx` | 275 | yes — `Tldraw`, `Editor`, `createShapeId`, `TLComponents`, `TLGridProps`, `TLShape`, `TLShapeId`, `tldraw/tldraw.css` |
| `moodboard-shape.tsx` | 185 | yes — `BaseBoxShapeUtil`, `HTMLContainer`, `T`, `RecordProps`, `TLBaseShape`, plus a `@tldraw/tlschema` module augmentation |
| `moodboard-toolbar.tsx` | 166 | yes — `useValue`, `Editor` |
| `moodboard.ts` | 226 | **no** — names tldraw only in prose |
| `moodboard-inspector.tsx` | 316 | no |
| `moodboards-workspace.test.tsx` | 366 | no — mocks the canvas entirely |
| `moodboard.test.ts` | 245 | no |
| `moodboards-workspace.tsx` | 228 | no |
| `moodboard-rail.tsx` | 216 | no |
| `use-moodboards.ts` | 190 | no |
| `moodboard-connector-layer.tsx` | 64 | no — but mounted via tldraw's `OnTheCanvas` slot |
| `moodboard-canvas-context.tsx` | 33 | no |
| `moodboard-icon.tsx` | 29 | no |

The load-bearing detail is `moodboard.ts`. It is the projection between the stored board model and
whatever draws it, and it imports **nothing** from tldraw — only `@level-zero/domain`. It defines
its own `MoodboardShapeInput` and `MoodboardShapeSnapshot` interfaces, and its 245-line test suite
runs without a canvas at all. The engine-specific work is confined to reading those two shapes in
and out of a library.

Within the three coupled files, a further ~180 lines are portable React that happens to live there:
the node bodies in `moodboard-shape.tsx` (lines 90–185) and the toolbar JSX in
`moodboard-toolbar.tsx` (lines 81–166) are plain `@level-zero/ui` components and Tailwind. The code
that genuinely knows about tldraw is roughly **210 lines**.

### 3.2 Must-have requirements

| # | Requirement | Where it lives in #46 |
| --- | --- | --- |
| M1 | Pan/zoom infinite canvas with selection | `<Tldraw>`; `zoomToFit()` on mount (`moodboard-canvas.tsx:136`) |
| M2 | Custom node rendering — one shape, a `nodeType` prop, seven kinds | `MoodboardShapeUtil` + `MoodboardShapeBody` (`moodboard-shape.tsx:39`, `:93`) |
| M3 | Drag and resize, persisted as x/y/width/height | `getShapePageTransform().decompose()` and `props.w/h` (`moodboard-canvas.tsx:219`) |
| M4 | Grouping, one level, with group-level drag | `groupShapes` / `ungroupShapes` (`moodboard-canvas.tsx:187`) |
| M5 | Z-order | position in `getCurrentPageShapesSorted()` → integer `zOrder`; `bringToFront` / `sendToBack` |
| M6 | Locked state | `shape.isLocked`; `editor.toggleLock` (`moodboard-toolbar.tsx:125`) |
| M7 | Hide the library's own UI, drive it from a custom toolbar + shared `Inspector` | `hideUi` (`moodboard-canvas.tsx:129`) |

Two properties of M2 are easy to miss and decide most of this comparison:

- **Node bodies are DOM.** They are Tailwind-styled `<div>`s and `<figure>`s using the design
  system's semantic tokens (`border-border`, `bg-surface`, `text-foreground`), a real `<img>` with
  `object-cover`, a `<figcaption>`, and `truncate` / `line-clamp-3` text handling.
- **Node bodies read React context.** `AssetBody` and `EntityBody` call
  `useMoodboardCanvasContext()` to resolve an `assetId`/`entityId` against the canonical rows. A
  node carries a *reference*, never a copy — that is the architectural point of the whole feature.

Any library that draws to a `<canvas>` bitmap rather than rendering host React into the DOM fails
both, and takes the design system down with it.

### 3.3 Wanted

**Rotation.** Stored as `rotation` (clockwise radians) in `MoodboardNodeLayout`
(`packages/domain/src/moodboard/moodboard-node.ts:35`), persisted as a
`doublePrecision('rotation').notNull().default(0)` column, validated on create and patch, compared
in `differsFromNode`, and displayed read-only by the inspector
(`moodboard-inspector.tsx:121`). Nothing in the product *sets* it except a tldraw rotate gesture —
there is no rotate control in the toolbar or the inspector.

### 3.4 Explicitly not required

- **Persistence / document format.** #46 persists no tldraw state at all. Board rows are projected
  into the canvas on open, and settled gestures are read back as patches to named fields
  (`pendingNodePatches`, `moodboard.ts:172`). A library's serialization format is irrelevant.
- **Connectors.** Drawn as an SVG overlay from node bounds
  (`moodboard-connector-layer.tsx`), deliberately *not* as library arrows, so that a line on a
  board can never be mistaken for a project relationship. A library's edge system is not wanted.
- **Collaboration / multiplayer.**

---

## 4. Licence findings

### 4.1 tldraw 5.4.1 — the version #46 pins

`pnpm-lock.yaml` on the #46 branch resolves `tldraw@5.4.1`, which is also `latest`.

```
npm view tldraw@5.4.1 license
→ license = 'SEE LICENSE IN LICENSE.md'
```

The licence at `LICENSE.md` is the proprietary "tldraw license". It is worse than the issue's
summary suggests. The relevant clauses, verbatim:

> **Permissions** — Subject to the following conditions, you are permitted to:
> - Use the Software in Development Environments.

> **Conditions** — In exchange for these permissions, you agree:
> - Not to use the Software in Production Environments.
> - Not to disable, change, or interfere with the Software's License Key enforcement.

> **Technical enforcement** — The Software includes technical measures to verify License Key
> validity, detect deployment environments, enforce usage restrictions based on license type, and
> ensure proper watermark display. The Software may collect and transmit usage data to tldraw for
> license compliance purposes.

So this is not "free with a watermark". Production use is **prohibited** by default; a Trial,
Hobby or Commercial **License Key** is the only route to it. Enforcement is technical as well as
contractual — tldraw's own documentation states the SDK logs errors and stops rendering the editor
after five seconds when a production deployment has no valid key.

There is no revenue or headcount threshold and no seat count in the licence text. The gate is
environment-based (development vs. production) and tier-based.

**A trap worth naming.** The `LICENSE.md` inside the published npm tarball is a single line
pointing at the licence file on the repository's `main` branch, not at the tag being installed.
The terms attached to an installed copy therefore track whatever `main` says today, rather than
being frozen at publish time.

### 4.2 Is any earlier tldraw major permissively licensed and still viable?

**No.** The history is precise, and there are two separate changes:

| Package | Versions | `license` | Dates |
| --- | --- | --- | --- |
| `@tldraw/tldraw` | `0.0.2` – `1.29.2` (stable) | **MIT** | 2021-07-25 → 2023-04-01 |
| `@tldraw/tldraw` | v2 canaries, `2.0.0-canary.97774cc01` – `...ded56e953af6` | **Apache-2.0** | 2023-03-22 → 2023-12-19 |
| `@tldraw/tldraw` | `2.0.0-canary.3cf4dae34d3e` onward | `SEE LICENSE IN LICENSE.md` | 2023-12-19 → present |
| `tldraw` | `0.0.1` (name placeholder, no real code) | ISC | 2024-01-25 |
| `tldraw` | every real release, `2.0.0-canary.3f5803729d1e` onward | `SEE LICENSE IN LICENSE.md` | 2024-02-29 → present |

Three conclusions:

1. **No stable tldraw 2.x or later was ever permissively licensed.** The licence changed on
   2023-12-19, more than two months before stable `2.0.0` shipped. The last permissive *stable*
   release is `@tldraw/tldraw@1.29.2` (MIT, 2023-04-01) — a completely different, unmaintained
   architecture predating the `Editor`/`ShapeUtil` API that `moodboard-shape.tsx` is written
   against, and three and a half years old. Not viable.
2. **The v2/v3 line is proprietary but was less restrictive**: its licence permitted commercial
   production use provided a "made with tldraw" watermark stayed visible. That still fails §2's bar
   (watermarks are excluded by name), and the tarball-pointer problem in §4.1 makes even that
   reading legally uncertain — an installed v3 resolves its terms to today's `main`, which forbids
   production use. **Not a workaround; if anyone is tempted, it is a question for counsel, not for
   this document.**
3. The tldraw 4.0 release (2025-09) is where "commercial use with a watermark" became "no
   production use without a key". Anyone whose mental model of tldraw's licence predates that
   release has an out-of-date model.

### 4.3 The alternatives

Every licence below was read in full from the project's own `LICENSE` file and is **verbatim,
unmodified MIT** — the standard grant and the standard warranty disclaimer, with no additional
clause of any kind. No paid key, no production-use restriction, no watermark, no attribution badge,
no seat count, no revenue or headcount trigger.

| Package | Version verified | npm `license` | Licence text |
| --- | --- | --- | --- |
| `@xyflow/react` | 12.11.6 | `MIT` | MIT, "Copyright (c) 2019-2025 webkid GmbH" |
| `@excalidraw/excalidraw` | 0.18.1 | `MIT` | MIT, "Copyright (c) 2020 Excalidraw" |
| `konva` | 10.5.0 | `MIT` | MIT, dual copyright (KineticJS 2011–2013, Konva 2014–) |
| `react-konva` | 19.2.7 | `MIT` | MIT, "Copyright (c) 2017 Anton Lavrenov" |
| `fabric` | 7.4.0 | `MIT` | MIT, dual copyright (Printio 2008–2015, contributors 2016–) |

Three caveats that a licence field alone would hide:

- **React Flow Pro is a separate product, not a restriction.** `@xyflow/react` renders a small
  "React Flow" attribution link by default, removed with `proOptions={{ hideAttribution: true }}`.
  The source comments that field with *"If you hide the attribution, please support our work with a
  subscription."* That is a **request in a code comment, not a licence term** — MIT governs, and
  MIT requires only that the copyright notice be retained. Hiding it is permitted. Whether to
  subscribe anyway is an ethics-and-budget call, not a compliance one, and it is not a blocker
  either way.
- **Konva's GitHub licence detector reports `NOASSERTION`.** This is an artifact of the two
  copyright lines above the MIT grant confusing the detector. The grant text is verbatim MIT and
  the npm field says MIT. Not a real finding.
- **Excalidraw is not MIT end to end.** Its Virgil/Excalifont handwriting font — which the editor
  ships and depends on visually — lives in `excalidraw/virgil` under **OFL-1.1**, which carries a
  Reserved Font Name restriction. OFL is a free licence and is not a blocker, but "MIT throughout"
  would be an inaccurate claim.

---

## 5. Candidates

### 5.1 React Flow — `@xyflow/react` 12.11.6, MIT

Already named in design system spec §1 ("React Flow — graphs, mechanics, relationships"), so
adopting it introduces no new UI framework under §1's "do not introduce additional UI frameworks
without a clear need" rule.

**On the "#43 rejected it" note in the issue:** #43 did not reject React Flow on capability. The
World workspace's relationship view was built as a structured list of design questions
(`apps/web/src/features/world/world-relationships.tsx`, 239 lines — "Held by", "Sits within",
"At stake here"), on the judgment that a node graph would be decorative rather than answer a
world-design question. React Flow has never actually been assessed against a canvas surface in
this repository.

| Req | Verdict | Notes |
| --- | --- | --- |
| M1 pan/zoom + selection | **Met** | Pan/zoom and marquee selection are core; `selectionOnDrag` for a box-select gesture |
| M2 custom nodes | **Met, and the best fit of any candidate** | `nodeTypes` maps a type string to an ordinary React component rendering ordinary DOM, inside the host React tree. `moodboard-shape.tsx`'s bodies and `useMoodboardCanvasContext()` transfer essentially unchanged |
| M3 drag + resize | **Met** | Drag is core; `NodeResizer` is exported from `@xyflow/react` itself (no extra package) and writes `width`/`height` onto the node |
| M4 grouping | **Met** | A parent node plus `parentId` and `extent: 'parent'` on children; dragging the parent moves the group. Maps directly onto the stored `groupId`. Gotcha: parents must precede children in the nodes array |
| M5 z-order | **Met, and simpler** | `zIndex` per node. The board already stores an integer `zOrder`, so it is assigned directly rather than derived from a sorted index as it is today |
| M6 locked | **Met by assembly** | No single `locked` flag; it is `draggable: false`, `deletable: false`, `selectable`, and not rendering `NodeResizer`. Same effect, three booleans instead of `toggleLock` |
| M7 hide library UI | **Met, trivially** | React Flow ships no chrome. `<Background>`, `<Controls>`, `<MiniMap>` are opt-in components. The only default UI is the attribution link |
| Rotation | **Not met** | `NodeBase` has `width`, `height`, `position`, `zIndex`, `parentId`, `extent`, `draggable`, `selectable`, `deletable` — and no rotation field. Drag maths, hit-testing and `NodeResizer` all assume axis-aligned boxes, so a hand-rolled CSS `rotate()` inside a node body would leave the selection outline and resize handles wrong. Not practically available |

Bundle: **183 KB minified, 59 KB gzipped** — an order of magnitude smaller than tldraw.
Maintenance: 16 stable releases in 12 months, last commit 2026-09-01, 88 open issues, MIT since its
first publish in 2024 with no licence transitions.

Dead weight: the edge, handle and connection system, which the board deliberately does not use.

**Blast radius:** `moodboard-canvas.tsx` rewritten (~275 lines, the largest single piece of work);
`moodboard-shape.tsx` loses its `ShapeUtil` class and module augmentation (~88 lines) while keeping
its bodies (~96 lines); `moodboard-toolbar.tsx` swaps `useValue` selection reads for
`useOnSelectionChange`/`useReactFlow` (~35 lines) and keeps its JSX; `moodboard-connector-layer.tsx`
moves from tldraw's `OnTheCanvas` slot to `<ViewportPortal>` (a mounting change, the SVG itself is
unchanged). `moodboard.ts`, its tests, the inspector, the rail, the workspace and `use-moodboards.ts`
are untouched — the workspace test already mocks the canvas. **Roughly 210 lines rewritten, ~180
lines moved, 1,900 lines untouched.**

### 5.2 Excalidraw — `@excalidraw/excalidraw` 0.18.1, MIT

Not a canvas engine. It is the whole Excalidraw *application* packaged as a React component, with a
fixed element vocabulary (rectangle, ellipse, arrow, text, freedraw, image, frame, embeddable) and
no general "render my React component as a shape" extension point. Node bodies would have to be
expressed as Excalidraw elements or squeezed through `customData`, and the design system would not
survive the trip.

| Req | Verdict |
| --- | --- |
| M1 | Met |
| M2 | **Not met** — no custom shape API; the element model is closed |
| M3 | Met, but against its element model rather than the board's |
| M4 | Partly — frames and groups exist, but are its own concepts |
| M5 | Met |
| M6 | Met (`locked` on elements) |
| M7 | **Partly** — `UIOptions` hides much of the chrome, but the component is fundamentally the Excalidraw app |
| Rotation | Met (`angle` on elements) |

Bundle: main chunk **1.07 MB min / 344 KB gzipped**, and it is heavily code-split — 117 assets
totalling ~6.9 MB minified / ~2.3 MB gzipped across all chunks. npm unpacked size 46.8 MB, driven
by bundled fonts. Maintenance: the app is very active (last commit 2026-09-09) but the embeddable
package is not — **one stable release in the last 12 months** (0.18.1, 2026-04-20), still pre-1.0
after five years, 2,286 open issues.

**Blast radius:** effectively a rewrite of the feature's presentation layer. Every node body
becomes an Excalidraw element description; the inspector's editing forms would need to write
through `customData`. Larger than tldraw's original implementation. **Not recommended.**

### 5.3 Konva / react-konva — 10.5.0 / 19.2.7, MIT

The most *technically* capable free option. A 2D scene graph over `<canvas>` with `Stage`
scale/position for pan/zoom, `draggable` nodes, `Konva.Group`, `zIndex`/`moveToTop`, and a
`Transformer` that does resize **and rotation**. It meets every Must-have and the Wanted item.

And it is the wrong tool here, for one reason: **it draws to a bitmap, not to the DOM.**

Every node body in `moodboard-shape.tsx` becomes imperative draw calls. The asset tile's
`object-cover` `<img>` with a truncating `<figcaption>`, the entity tile's `line-clamp-3`
description, the palette's flex row of swatches, and every `border-border` / `bg-surface` /
`text-foreground` token become `Konva.Image`, `Konva.Rect` and `Konva.Text` with manually computed
layout and hard-coded colour values duplicated out of `packages/ui/src/styles.css`. Text wrapping
and truncation become the board's problem. The result cannot match the rest of the app without
maintaining a second copy of the design tokens in JavaScript, which is precisely what the
`--lz-*`/`--color-*` arrangement exists to prevent.

Secondary losses: no DOM means no `alt` text, no text selection, no accessibility tree, and
`moodboards-workspace.test.tsx`-style assertions on node content become impossible.

Bundle: 181 KB min / 55 KB gz (konva) plus 126 KB min / 39 KB gz (react-konva) — roughly **97 KB
gzipped** for the pair, the smallest here. Maintenance: excellent — 24 and 19 releases in 12
months, last commits 2026-09-08/09, and a genuine **zero** open issues across 1,603 lifetime
issues.

**Blast radius:** the largest of any candidate. All three tldraw files rewritten *and* all ~96
lines of node bodies re-implemented as canvas drawing, plus new text-layout code that does not
exist today. **Not recommended, despite meeting every requirement on paper** — this is the case
where the requirement checklist and the right answer diverge.

### 5.4 Fabric.js — `fabric` 7.4.0, MIT

Same fatal objection as Konva — it is a `<canvas>` object model — with worse ergonomics for this
codebase: no first-class React binding, its own serialization and event model to learn, and 292 KB
min / 90 KB gzipped, the heaviest of the free options. It has rotation, grouping, z-order and
`lockMovementX/Y`. Maintenance is the weakest of the actively-developed candidates: 9 releases in
12 months and `master`'s last commit a month old (2026-08-08 — note the repository's `pushed_at`
reflects other branches).

**Blast radius:** as large as Konva's, plus the React integration Konva already provides. **Not
recommended.**

### 5.5 A plain DOM/SVG implementation — no dependency

Taken seriously, as the issue asks, because the board needs a small fraction of what a general
canvas SDK offers and already owns its model, its hit-testing needs, its toolbar and its inspector.

What it would take, roughly:

| Piece | Approach | Rough size |
| --- | --- | --- |
| Pan/zoom | One absolutely-positioned container with `transform: translate(x,y) scale(z)`; wheel and space-drag | ~60 lines |
| Selection | The browser hit-tests DOM nodes for free; marquee is a rectangle intersection against stored bounds | ~80 lines |
| Drag | Pointer events with pointer capture, deltas divided by scale | ~50 lines |
| Resize | Corner and edge handles | ~80 lines |
| Rotation | One handle and `Math.atan2`, plus a CSS `rotate()` | ~40 lines |
| Grouping | `groupId` is already stored; group drag moves members, group bounds are their union | ~40 lines |
| Z-order | `zOrder` is already stored → `style.zIndex` | ~10 lines |
| Lock | Skip in hit-testing | ~5 lines |

Call it **400–600 new lines** in `apps/web/src/features/moodboards/`, and it is the fiddly kind:
pointer capture and release, trackpad pinch versus wheel, touch, coordinate conversion at
arbitrary zoom, resize handles that behave correctly on a rotated node, and staying smooth at a few
hundred nodes.

| Req | Verdict |
| --- | --- |
| M1–M7 | **All met** — by writing them |
| Rotation | **Met** — the only free option that keeps rotation without a canvas rewrite |

What is genuinely lost against tldraw: **undo/redo**. tldraw gives Ctrl+Z for free. The board does
not currently expose it — `reconcile` deliberately runs with `history: 'ignore'` — so nothing
*depends* on it, but a moodboard without undo is a worse moodboard, and a hand-rolled canvas would
have to earn it back. Also lost: snapping and alignment guides, nudge keys, and the accumulated
polish of a mature canvas.

**Blast radius:** the three tldraw files rewritten (~210 lines replaced) plus 400–600 lines of new
interaction code. Node bodies, `moodboard.ts`, the inspector, the rail and the workspace are
untouched. Larger than React Flow, much smaller than Konva.

### 5.6 Buying a tldraw licence

A legitimate outcome, and the issue is explicit that it need not find a replacement. It keeps #46
exactly as written — zero code change, zero risk, rotation intact, spec §1 and §30 unamended.

Against it: an unknown recurring cost (tldraw publishes no list price, describing its commercial
tier as "value-based"; the widely-repeated ~$6,000/yr figure is unverified secondary reporting), a
hobby tier that is non-commercial only and granted at tldraw's discretion, a licence that has
already been made materially stricter once (§4.2), a licence file in the published tarball that
tracks the vendor's `main` branch, and 512 KB gzipped for a feature that needs a fraction of it.

For a project at Level Zero's stage this is a large, open-ended commitment to buy a box that drags
and rotates.

---

## 6. Requirement matrix

| | tldraw 5.4.1 | React Flow 12.11.6 | Excalidraw 0.18.1 | Konva 10.5.0 | Fabric 7.4.0 | Plain DOM/SVG |
| --- | --- | --- | --- | --- | --- | --- |
| **Free for production** | **No** | Yes (MIT) | Yes (MIT) | Yes (MIT) | Yes (MIT) | Yes (n/a) |
| M1 pan/zoom + selection | Met | Met | Met | Met | Met | Met (built) |
| M2 custom node rendering | Met | **Met (DOM)** | **Not met** | Met (bitmap) | Met (bitmap) | **Met (DOM)** |
| M3 drag + resize | Met | Met | Met | Met | Met | Met (built) |
| M4 grouping + group drag | Met | Met | Partly | Met | Met | Met (built) |
| M5 z-order | Met | Met | Met | Met | Met | Met |
| M6 locked | Met | Partly (assembled) | Met | Met | Met | Met |
| M7 hide library UI | Met | Met | Partly | Met (no UI) | Met (no UI) | Met (n/a) |
| Rotation | Met | **Not met** | Met | Met | Met | Met (built) |
| Design system survives | Yes | **Yes** | No | **No** | **No** | **Yes** |
| Gzipped size | 512 KB | **59 KB** | 344 KB+ | 97 KB | 90 KB | 0 KB |
| Releases / 12 mo | 50 | 16 | 1 stable | 24 | 9 | n/a |
| Lines rewritten in `features/moodboards/` | 0 | ~210 | ~1,000+ | ~500+ | ~500+ | ~210 + 400–600 new |

---

## 7. Rotation

React Flow cannot rotate nodes, and the recommendation below is React Flow. Stated plainly, here is
what that costs and what the board model should do about it.

**What is lost.** Design system spec §30 lists `rotate` among Moodboard node behaviours, and #46's
issue body lists rotation under layout metadata. A moodboard is arguably the one surface where it
matters most: a slightly tilted photograph is the visual language of a physical pinboard, and
strict axis-alignment reads as a diagram rather than a mood board. Adopting React Flow means
shipping a Moodboard that cannot do something the design source of truth says it does. **That is a
decision to amend the spec, not merely to change a library**, and it should be made deliberately.

**What the board model should do: keep the field.** `rotation` is a `doublePrecision` column with a
`0` default, validated and patched in framework-free domain code that knows nothing about any
canvas. Under React Flow every node simply reports `0` and every other layer behaves identically.
Dropping it buys eight bytes a row at the cost of a destructive migration now and a re-adding
migration later; the field is the cheapest possible option on a future engine, and #46 is unmerged
so no board has ever stored a non-zero value.

**Two things to change if React Flow is adopted:**

- Drop the `· 0°` fragment from the inspector's Placement line
  (`moodboard-inspector.tsx:121`). A read-out that can only ever say `0°` is noise.
- Do **not** ship a rotate affordance that silently does nothing. Absent capability is
  disappointing; a broken control is a bug report.

**If rotation is judged non-negotiable**, React Flow is out and the honest choices narrow to two:
the plain DOM/SVG implementation, where rotation is roughly forty lines of `atan2` and a CSS
transform, or buying a tldraw licence.

---

## 8. Recommendation

**Adopt React Flow (`@xyflow/react`, MIT), and drop rotation from the Moodboard.**

The reasoning, in order of weight:

1. **It is the only candidate that is both genuinely free and keeps node bodies as DOM.** That
   pairing is the whole decision. Konva and Fabric are equally free and meet more requirements on
   paper, but converting seven Tailwind-styled React components into canvas draw calls means
   duplicating the design tokens in JavaScript and giving up on the board matching the rest of the
   app. Excalidraw cannot render custom nodes at all.
2. **The licence is boring, which is the point.** Verbatim MIT, unchanged since the package's first
   publish in 2024, no key, no watermark, no threshold, no clause beyond the standard grant. The
   attribution link is a request in a code comment, not a term.
3. **No new framework decision is required.** Spec §1 already sanctions React Flow. #43 chose a
   list view over a graph for the World workspace on design grounds, not on React Flow's
   capability, so nothing here contradicts an earlier judgment.
4. **The swap is small and lands where the code is already thin.** `moodboard.ts` — the tested core
   of the projection — imports nothing from tldraw and does not change. Roughly 210 lines are
   rewritten against 1,900 that are not.
5. **Two stored fields get simpler.** `zOrder` becomes React Flow's `zIndex` directly instead of
   being derived from a sorted index, and `groupId` becomes `parentId` directly instead of being
   reconstructed each reconcile by `reconcileGroups`.
6. **The cost is bounded and there is no data to migrate.** #46 is unmerged and on hold.
7. **512 KB gzipped becomes 59 KB.**

### The strongest argument against

**Rotation, and what conceding it says about the process.** The design package is the repository's
source of truth for anything user-facing, and §30 says the Moodboard's nodes rotate. Choosing a
library that cannot do that is letting a licensing constraint quietly rewrite a design decision.
The right answer might instead be to hold the design and pay for it — either in money (a tldraw
licence) or in effort (the DOM/SVG implementation, where rotation is cheap and the loss is undo/redo
instead). If whoever decides this believes a moodboard whose images cannot tilt is meaningfully
worse, that belief should win, and the recommendation above should be rejected.

### The second-strongest

**React Flow is a graph library, and this is not a graph.** The board draws its connectors as an
overlay from node bounds specifically so they are never mistaken for domain relationships
(`moodboard-connector-layer.tsx`); React Flow's edges, handles and connection system — a large
share of what would be adopted — are dead weight. A canvas that needs pan, zoom, drag, resize,
group and z-order and nothing else is well within reach of ~500 lines of pointer handling that
would fit the board's model exactly rather than being bent to fit a node-graph model. If a
prototype finds React Flow's drag and resize semantics fighting `pendingNodePatches`, **the
fallback is the DOM/SVG implementation, not tldraw.**

---

## 9. Follow-up

Deliberately **not** done here:

- **The swap itself.** Three files import tldraw, so it is bounded, but it is a decision. It should
  be its own issue, opened once someone has read this and chosen.
- **Amending `docs/design/frontend-design-system-and-implementation-spec.md`.** If React Flow is
  adopted, **two** places need editing, and they should be edited together with the swap rather
  than in advance:
  - **§1** (line 43) lists `tldraw — moodboard / freeform canvas` under optional libraries. The row
    should move to React Flow, and tldraw should be removed rather than left as an alternative —
    the licence makes it one.
  - **§30** lists `rotate` among node behaviours. If rotation is dropped, this line must go with
    it, or the spec will keep asserting a behaviour the product does not have.

---

## Appendix A — how the numbers were obtained

All figures checked **2026-09-09**.

**Licence fields** — the npm registry, first-hand: `npm view <pkg>@<version> license`, and the full
version history via `https://registry.npmjs.org/<pkg>` (which carries every published version's
`license` field and publish time). The tldraw licence-history table in §4.2 was built by grouping
every published version of both `tldraw` (3,768) and `@tldraw/tldraw` (4,971) by its `license`
field, so the cutover dates are the registry's own, not a changelog's.

**Licence texts** — fetched in full from each project's own repository:

- `https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md`
- `https://raw.githubusercontent.com/xyflow/xyflow/main/LICENSE`
- `https://raw.githubusercontent.com/excalidraw/excalidraw/master/LICENSE`
- `https://raw.githubusercontent.com/konvajs/konva/master/LICENSE`
- `https://raw.githubusercontent.com/fabricjs/fabric.js/master/LICENSE`

**API claims** — read from source rather than documentation:
`packages/system/src/types/nodes.ts` (React Flow's `NodeBase` fields, confirming the absence of
rotation and the presence of `parentId`/`extent`/`zIndex`/`draggable`/`selectable`/`deletable`),
`packages/react/src/additional-components/index.ts` (confirming `NodeResizer` and `NodeToolbar` ship
in the core package), and `packages/react/src/types/general.ts` (the `ProOptions.hideAttribution`
comment).

**Bundle sizes** — `https://bundlephobia.com/api/size?package=<pkg>@<version>`, reported in bytes
and converted at 1024. These measure a package built in isolation; real application cost after
tree-shaking will be lower, and the Excalidraw figure in particular is approximate because the
package is code-split across 117 assets.

**Maintenance signals** — the GitHub REST API (`https://api.github.com/repos/<owner>/<repo>` for
stars, open counts and last push; `/commits` for the default branch's last commit) and the npm
registry's `time` map for release cadence. Open-issue counts are the issues-only figures from
GitHub's search API; the raw `open_issues_count` field includes pull requests and is higher.

**Not verified, and flagged as such:**

- **tldraw's commercial price.** No primary source publishes one; `tldraw.dev/pricing` describes it
  as value-based. The ~$6,000/yr figure quoted in §5.6 is secondary reporting and should not be
  relied on for budgeting.
- **tldraw's hobby-licence approval criteria.** Documented as a discretionary review with no
  published objective test, so availability cannot be assumed.
- **Whether tldraw v3 remains usable in production under its own tag's watermark licence.** The v3
  tag's `LICENSE.md` permits it; the shipped npm tarball's `LICENSE.md` redirects to `main`, which
  forbids it. The artifacts genuinely conflict. This is a legal question, not a factual one, and
  §4.2 recommends against relying on either reading.
- **Runtime enforcement behaviour** (errors logged, editor stops rendering after five seconds
  without a production key) comes from tldraw's own documentation and issue #59, not from an
  observed deployment.
