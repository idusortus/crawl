# Spec Delta

## Purpose

Draws the dungeon map and heads-up display from game state as a grid of glyph tiles, distinguishing what is currently visible, previously explored, and unseen.

## ADDED Requirements

### Requirement: The map renders a tile for every grid cell

The renderer SHALL draw one tile for each cell of the current level grid in a fixed-size grid layout, so the whole map is represented.

#### Scenario: Full grid is rendered

- **WHEN** the game screen renders a 40 by 30 level
- **THEN** the map contains one tile per cell of that level

#### Scenario: Terrain is drawn from grid passability

- **WHEN** a cell is non-passable terrain
- **THEN** the tile shows the wall representation rather than a floor representation

### Requirement: Entities and the player are drawn from state using pack glyphs

The renderer SHALL draw the player and any entities occupying a visible tile, using the glyph supplied by the loaded content pack for that entity's kind, with the player distinguishable from other entities.

#### Scenario: The player is drawn at its position

- **WHEN** the map renders and the player occupies a visible tile
- **THEN** that tile shows the player's glyph

#### Scenario: An entity glyph comes from the pack

- **WHEN** an entity whose kind is defined by the loaded pack occupies a visible tile
- **THEN** that tile shows the glyph the pack declares for that kind

#### Scenario: An unknown entity kind falls back safely

- **WHEN** an entity occupies a visible tile whose kind (or player class id) is absent from the loaded pack
- **THEN** that tile shows a safe fallback glyph and the renderer does not crash

### Requirement: Visibility states are visually distinct

The renderer SHALL distinguish, for each tile, three states — currently visible, explored but not currently visible, and never seen — using different visual treatments. A never-seen tile SHALL NOT reveal terrain or entity glyphs.

#### Scenario: Visible tile is drawn at full strength

- **WHEN** a tile is currently visible
- **THEN** its terrain and any entity glyph are drawn in the visible treatment

#### Scenario: Explored tile is drawn dimmed

- **WHEN** a tile has been explored but is not currently visible
- **THEN** its terrain is drawn in a distinct dimmed treatment and no current entity is shown

#### Scenario: Unseen tile reveals nothing

- **WHEN** a tile has never been explored
- **THEN** the tile is drawn in the unseen treatment and shows no terrain or entity glyph

### Requirement: A heads-up display shows progression and health

The renderer SHALL show the current dungeon depth and the player's current hit points, updating as state changes.

Note: this stage has **no HP-changing command** (no combat, no `use-item` UI), so the displayed HP is static in play. The "hit points reflect the current value" requirement is verified against a crafted state (a `GameState` whose player HP differs from the initial value), not via player input.

#### Scenario: Depth is displayed

- **WHEN** the player descends to a deeper level
- **THEN** the displayed depth reflects the new level's depth

#### Scenario: Player health is displayed

- **WHEN** the renderer is given a state whose player hit points value differs from another state's
- **THEN** the displayed hit points reflect the player's current value (verified against a crafted state, since no command changes HP this stage)
