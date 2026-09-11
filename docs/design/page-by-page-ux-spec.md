# Level Zero — Page-by-Page UX Specification

## Product workflow

Level Zero is not a rigid wizard. Users can move freely across the project, but canonical entities and lineage preserve how work relates.

Typical progression:

`Idea → Explore → World / Characters / Mechanics → Moodboards / Visual Development → GDD → Prototype → Assets → Build`

## Global shell

Desktop:

- 184px project/navigation sidebar
- flexible primary workspace
- optional 320px contextual inspector
- 48px top bar for breadcrumbs, search, collaboration, and account actions

The sidebar contains project-level destinations, not every sub-feature. Sub-navigation belongs inside each page.

## Universal selection

Meaningful objects can be selected: ideas, characters, images, mechanics, locations, assets, prototype objects, document entity mentions, and tasks.

Selecting generally:
1. highlights the object
2. updates the inspector
3. exposes contextual actions
4. keeps the user in the current workspace

Double-click or **Open** navigates to the canonical entity.

## Universal inspector

Typical tabs:

- Details
- AI
- Links
- History

When nothing is selected, the inspector becomes page-level assistance rather than an empty panel.

---

## Home

### Purpose
Cross-project entry point answering:
- what am I working on?
- what changed?
- what needs attention?
- where can I capture a thought quickly?

### Key regions
- Continue Working project cards
- Recent Work
- Needs Attention
- Quick Capture
- New Project

### Quick Capture
Accept text, pasted images, URLs, screenshots/files, and eventually voice.

Submit as:
- Save as Idea
- Explore with AI
- Add to Existing Project
- Create New Project

---

## Project Overview

### Purpose
Creative command center for one game.

### Key regions
- cinematic project hero
- design pillars
- current focus
- open questions
- world snapshot
- key characters
- recent activity

Design pillars are promoted ideas rather than loose notes.

Open questions may originate from the user, AI analysis, GDD conflicts, or playtests.

---

## Idea Lab

### Purpose
Turn rough thoughts into useful design directions through divergence, branching, combination, comparison, and promotion.

### Default layout
- idea graph/canvas
- filters/status
- selected-idea detail
- contextual AI exploration inspector

### Core actions
- New Idea
- Explore
- Branch
- Compare
- Combine
- Promote

Promotion targets include:
- Design Pillar
- Mechanic
- Character
- Location
- Faction
- World Rule
- GDD Section
- Prototype Experiment

Promotion creates a lineage edge automatically.

---

## Moodboards

### Purpose
Visual research and exploration.

### Experience
Intentionally looser than the rest of the application: an infinite/freeform canvas.

### Supported objects
- uploaded image
- generated image
- text
- sticky note
- palette
- URL/reference
- character
- location
- asset
- group

### Behaviors
- drag
- resize
- rotate
- group
- connect
- annotate
- lock
- duplicate

Selection exposes AI operations such as:
- Explore Style
- Generate Variations
- Extract Palette
- Describe Visual Language
- Turn into Location Concept

Multiple references can be selected to generate new visual directions.

---

## World

### Purpose
Maintain canonical setting information as interconnected entities rather than one giant wiki.

### Entity categories
- Locations
- Regions
- Factions
- Lore
- Events
- Hazards
- Cultures
- Technology
- World Rules
- Relationships
- Maps

### Overview
- Sector/world map
- Major Factions
- Key Locations
- Timeline
- World Rules
- Environment tags/hazards
- Relationship graph

AI suggestions remain proposals until explicitly accepted.

---

## Characters

### Purpose
Combine narrative design, visual development, relationships, and gameplay relevance.

### Desktop layout
- character browser: ~32–38%
- selected character detail: flexible
- inspector/AI studio: 320px

### Character tabs
- Overview
- Visuals
- Background
- Inventory
- Relationships
- Notes

### Visual actions
- Generate Portrait
- Expression Sheet
- Outfit Variants
- Turnaround
- Pose Sheet
- 3D Concept

Relationship view should support a graph with selectable relationship edges.

---

## Mechanics

### Purpose
Turn design ideas into structured systems that can be tuned, linked, and tested.

### Core modules
- Core Loop
- Progression
- Resources
- Economy
- Crafting
- Combat
- AI
- Risk / Reward
- Difficulty
- Rewards
- Exploration

### Mechanic detail
Each mechanic can define:
- fantasy
- rules
- inputs
- outputs
- tuning parameters
- linked mechanics
- implementation status
- open questions

### AI actions
- Challenge this mechanic
- Find exploits
- Simplify
- Increase strategic depth
- Generate variations
- Suggest tuning values
- Identify conflicting systems
- Create prototype plan

Primary maturity transition:

**Create Prototype**

---

## GDD

### Purpose
Canonical written expression of the game's design.

The GDD should reference canonical project entities instead of duplicating them.

### Desktop layout
- 220px table of contents
- 720–860px reading/editor column
- 320px AI drafting inspector

### Entity mentions
Typing `@` can link a Character, Mechanic, Location, Faction, Prototype, etc.

If canonical entity data changes, dependent text can become **Stale** and request review.

### Section status
- Draft
- Review
- Approved
- Stale

---

## Canonical entity page

### Purpose
Deep link and navigation destination for **Open** commands across the project.

The inspector is the primary in-workspace reading surface; this page is where **Open** navigates.

### Route
`/projects/:projectId/entities/:entityId`

### Components
- Entity identity and status
- Entity relationships
- Entity version history
- Type-specific body

For types with a dedicated detail surface (Character, Mechanic, Location, etc.), the page shows the full rich body. Other types see a generic fallback displaying description, tags, and any additional data fields.

### States

**Archived** renders the full page read-only with an archived status badge and a Restore action.

**Missing** and cross-project ids render the same not-found state, without confirming whether the entity exists elsewhere.

---

## Prototypes

### Purpose
Make design decisions playable as quickly as possible.

The playable view must dominate the page.

### Workspace
- playable viewport
- prototype tasks
- version strip
- activity
- actions: Play, Restart, Compare, Capture, Send to Engine

### Capture Insight
During play, users can attach observations to:
- prototype version
- timestamp
- linked mechanic
- current parameters

Insights may become Questions, Tasks, GDD updates, or mechanic revisions.

### Compare
Compare prototype versions side-by-side including parameters, observations, metrics, and player feedback.

---

## Assets

### Purpose
Canonical production media library.

Moodboards contain inspiration. Assets contain things intended to become part of the game.

### Asset types
- images/concept art
- 3D
- audio
- UI
- animation
- textures
- files

### Views
- Grid
- List
- Collections
- Pipeline

### States
- Reference
- Generated
- Selected
- Approved
- Production Ready

Generation results do not become canonical assets until promoted/selected.

### Asset detail
- preview
- versions
- usage
- generation provenance
- files
- history

---

## Build

### Purpose
Transition from creative development into implementation and production orchestration.

### Major areas
- Engine Integrations
- Scenes
- Asset Pipeline
- Code Tasks
- Build Targets
- Build Queue
- Agent Activity
- Approval Workflow
- Logs
- Deploy

### Production task states
- Queued
- Running
- Blocked
- Review
- Complete
- Failed

Significant/destructive production changes require explicit human review.

---

## Playtesting

Playtesting is a shared workflow accessible from Prototype, Build, and Overview.

Capture:
- goal
- participants
- observations
- feedback
- metrics
- linked entities

A playtest insight can become:
- Question
- Task
- Suggested Change
- GDD update

---

## Universal context menu

Show only applicable actions:

- Open
- Edit
- Ask AI
- Explore Variations
- Add to Moodboard
- Add to GDD
- Link To...
- Promote...
- Duplicate
- Archive
- Delete

---

## Creative lineage

Every canonical entity can expose **View Lineage**.

Example:

`Environment References → Moodboard Direction → Location Concept → Approved Art → 3D Environment → Prototype Scene`

This lineage is a core product differentiator.

---

## AI permission model

### Low risk
May execute directly:
- generate suggestion
- generate draft
- generate image
- explore variation

### Project changing
Preview/confirm:
- create canonical entity
- change approved mechanic
- replace asset
- modify GDD

### Production changing
Explicit approval:
- modify code
- delete assets
- change engine scenes
- deploy builds

---

## Ownership boundaries

### Idea Lab owns
possibilities, rough branches, design exploration

### Moodboards own
visual references and style exploration

### World owns
setting canon

### Characters owns
canonical character data and relationships

### Mechanics owns
game systems and tuning

### GDD owns
formal design communication

### Prototype owns
playable experiments and insights

### Assets owns
production media and versions

### Build owns
implementation, agents, builds, and deployment

---

## MVP priority

### Phase 1 — Creative Core
- Home
- Project Overview
- Idea Lab
- Moodboard
- Characters

### Phase 2 — Structured Design
- World
- Mechanics
- GDD

### Phase 3 — Playable Workbench
- Prototype
- Assets

### Phase 4 — Production
- Build
- Engine Integration
- Agents
- Playtesting

Strongest vertical slice:

`Project → Idea Lab → Moodboard → Mechanic → GDD → Prototype`

with universal entities, contextual AI, lineage, promotion, and version history.
