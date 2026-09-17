# Level Zero Design Package

Design and visual-reference assets for **Level Zero**, an AI-native game development workspace.

This package is intended to be copied into the `pmhood/level-zero` repository.

## Contents

### `docs/design/`

- `style-guide.md` — product visual language, typography, colors, layout, AI styling, and brand usage
- `frontend-design-system-and-implementation-spec.md` — implementation-facing React/Tailwind/component specification
- `page-by-page-ux-spec.md` — UX behavior for Home, Overview, Idea Lab, Moodboards, World, Characters, Mechanics, GDD, Prototype, Assets, Build, and Playtesting

### `docs/decisions/`

Engineering evaluations written in this repository, rather than imported design material.

- `asset-library-model.md` — collections, tags, pipeline state and versions for assets (issue #177)
- `canonical-entity-routes.md` — HTTP routing and navigation model for entities (issue #86)
- `consistency-findings.md` — storage model for project consistency findings (issue #88)
- `gdd-section-identity.md` — what addresses a GDD section, and what an anchored comment or decision does when it moves (issue #185)
- `moodboard-canvas-library.md` — freely licensed alternatives to tldraw for the Moodboard canvas (issue #59)
- `playtest-record-model.md` — database design for playtests and playtest records (issue #85)
- `promotion-registry.md` — promotion registry shape and semantics (issue #87)

### `docs/mockups/`

High-fidelity Workbench/Level Zero product explorations:

- `home-dashboard.png`
- `workbench-core-pages-composite.png`
- `world-workspace.png`
- `characters-workspace.png`
- `mechanics-workspace.png`
- `gdd-workspace.png`
- `build-workspace.png`

The mockups still use the earlier **Workbench** working name in places. Treat the interaction and visual design as the reference; the current product name is **Level Zero**.

### `docs/brand/`

- `brand-direction.md`
- `explorations/` — naming/logo development including the final foundation-tile direction

The current preferred mark is the minimal isometric foundation tile, with both blue and monochrome variants.

### `assets/icons/`

SVG icon language generated from the Workbench mockups. Icons use a consistent 24×24 rounded-stroke system and `currentColor`.

### `docs/source/`

Raw project/design source retained for reference.

## Current naming

**Level Zero**

Tagline:

**Ideas to Play.**

Secondary line:

**Before Level One.**

## Note

These files are design/reference artifacts. Product mockups may include generated concept imagery and placeholder game/project content.
