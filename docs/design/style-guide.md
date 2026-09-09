# Level Zero — Product Style Guide

> The product was originally explored under the working name **Workbench**. The current brand direction is **Level Zero**.

## Brand concept

Level Zero is an AI-native game-development workspace that helps creators move from a rough idea to something playable.

**Core idea:** Level Zero is the space before Level One — where a game is imagined, explored, designed, prototyped, and prepared for production.

Recommended tagline:

**Ideas to Play.**

Secondary brand line:

**Before Level One.**

## Brand attributes

- **Cinematic** — game artwork and visual development remain present throughout the product.
- **Focused** — information-dense, but strongly hierarchical.
- **Creative** — supports branching, iteration, references, comparison, and experimentation.
- **Technical** — credible enough to extend into engines, code, builds, and production.
- **AI-native** — AI is contextual to the work instead of being a chatbot bolted onto every page.

## Visual philosophy

The UI should feel like a professional game-development environment crossed with a creative studio and worldbuilding workspace.

Avoid:
- generic SaaS dashboard styling
- excessive glassmorphism
- neon glows on every component
- overly rounded cards
- making every workflow a chat interface

## Color system

### Foundations

| Token | Value | Use |
|---|---|---|
| Canvas | `#08131C` | Application background |
| Sidebar | `#09151E` | Navigation |
| Surface | `#0D1923` | Panels/cards |
| Elevated | `#12222E` | Raised controls |
| Hover | `#172B39` | Hover/selection surface |
| Border | `#213744` | Default border |
| Strong Border | `#315065` | Emphasized boundaries |

### Text

| Token | Value |
|---|---|
| Primary | `#F2F6F8` |
| Secondary | `#A8BAC5` |
| Muted | `#718894` |
| Disabled | `#4D626D` |

### Accent

| Token | Value | Meaning |
|---|---|---|
| Level Zero Blue | `#42A5FF` | Primary actions/navigation |
| Blue Hover | `#64BCFF` | Hover |
| AI Purple | `#A982F4` | Generative/AI actions |
| Success | `#49D7A0` | Positive status |
| Warning | `#E8B94C` | Caution |
| Error | `#F16E72` | Errors/destructive state |

Project-specific colors may accent artwork, graph nodes, timelines, or tags, but should not replace the global interaction blue.

## Typography

Recommended primary fonts:

1. Inter
2. Geist
3. SF Pro

Suggested scale:

- Display: 32–40px / 700
- Page title: 26–30px / 650–700
- Section title: 18–20px / 600
- Card title: 14–16px / 600
- Body: 14px / 400
- Supporting: 12–13px
- Metadata: 11–12px

A handwritten secondary face may appear sparingly over game artwork for designer-note moments. Never use handwritten type for functional UI.

## Spacing

4px base grid.

Primary tokens:

`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48px`

Most UI composition should use 12, 16, or 24px.

## Radius

- Small: 4px
- Default: 6px
- Card: 8px
- Large: 10–12px

Pills are reserved for tags, filters, and statuses.

## Layout

Standard desktop shell:

`184px sidebar / flexible workspace / optional 320px inspector`

The inspector answers:

**What can I do with the thing I currently have selected?**

It should not exist just to permanently display AI chat.

## Imagery

Artwork is central to Level Zero.

Prioritize:
- cinematic project headers
- large thumbnails
- contact sheets
- moodboards
- character sheets
- environment references
- comparison views

Generated imagery should retain provenance: provider/model, prompt, references, parent entity, version, and creation timestamp.

## AI language

Normal deterministic interactions use blue.

AI/generative interactions use a restrained purple accent.

Prefer contextual language:

- Explore variations
- Challenge this mechanic
- Turn into Character
- Add to GDD
- Prototype this
- Find conflicts
- Generate visual directions

Avoid overly enthusiastic assistant copy.

## Brand mark

The selected Level Zero logo direction is the **isometric foundation tile**.

Two intended variants work as one identity system:

- **Minimal blue tile** — primary expressive brand mark.
- **Monochrome tile** — restrained/functional version for documentation, print, tiny UI, or environments where gradients are inappropriate.

The tile represents:
- a foundation
- a level surface
- the first building block
- an empty game-space ready for creation

## Product principle

Every screen should make three things clear:

1. **What am I working on?**
2. **What can I do next?**
3. **Where did this come from?**

Everything in the game should retain lineage.
