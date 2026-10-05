# ui/glyph-renderer Specification

## Purpose
Draws the dungeon map and heads-up display from game state as a grid of glyph tiles, distinguishing what is currently visible, previously explored, and unseen.

## Requirements

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

The renderer SHALL show the current dungeon depth and the player's current hit points, updating as state changes, and SHALL surface the run's terminal status so a dead player is not shown as a normal in-progress run.

#### Scenario: Depth is displayed

- **WHEN** the player descends to a deeper level
- **THEN** the displayed depth reflects the new level's depth

#### Scenario: Player health is displayed

- **WHEN** the renderer is given a state whose player hit points value differs from another state's
- **THEN** the displayed hit points reflect the player's current value

#### Scenario: The terminal status is surfaced

- **WHEN** the run has ended
- **THEN** the renderer shows a game-over surface rather than the ordinary in-progress view

### Requirement: Monsters, items, and stairs are drawn from state using pack glyphs

The renderer SHALL draw monsters, floor items, and the stairs on visible tiles, using the glyph supplied by the loaded content pack for each entity kind and a distinct `STAIRS_GLYPH` (e.g. `'>'`) for stairs (terrain has no pack glyph), with the player distinguishable from all of them. `tileRender` SHALL accept a stairs input and the map view SHALL pass the level's stairs position.

#### Scenario: A visible monster is drawn

- **WHEN** a monster occupies a visible tile
- **THEN** that tile shows the glyph the pack declares for that monster kind

#### Scenario: A visible item is drawn

- **WHEN** a floor item occupies a visible tile
- **THEN** that tile shows the glyph the pack declares for that item kind

#### Scenario: Stairs are drawn distinctly

- **WHEN** the stairs tile is visible
- **THEN** it is drawn with `STAIRS_GLYPH`, distinct from ordinary floor

#### Scenario: Occupants on explored-but-not-visible tiles are not shown

- **WHEN** a tile has been explored but is not currently visible
- **THEN** no monster, item, or stairs is shown as an occupant on it (the flat terrain is shown)

### Requirement: A game-over surface renders from the terminal state

The renderer SHALL render the game-over surface from the terminal run status, presenting an unmistakable end-of-run state rather than a frozen or unchanged screen.

#### Scenario: Game over replaces the play view

- **WHEN** the run's status becomes terminal
- **THEN** the renderer shows a game-over surface and does not continue to render an ordinary playable screen

#### Scenario: Game over is distinct from a frozen map

- **WHEN** the player dies
- **THEN** the surface makes the end of the run explicit (for example a title/message) rather than leaving the map unchanged with no explanation

#### Scenario: A new run clears the game-over surface

- **WHEN** the client starts a fresh run after game over
- **THEN** the renderer shows the ordinary play view for the new run

### Requirement: The map viewport follows the player

The renderer SHALL present the full map inside a viewport clipped to the available screen area and SHALL position the map within that viewport so the player's tile remains visible at all times, translating the map as the player moves rather than letting the player scroll out of view. The viewport SHALL be clamped at the map edges so the map is never pulled past its own edge (leaving no empty margin beyond a map edge), and SHALL center the player only while the player is farther than half a viewport from every map edge. When the map is smaller than the viewport in an axis, the offset in that axis SHALL be zero (the map is not offset). The camera SHALL NOT animate and SHALL be a deterministic function of the player position and the measured viewport size.

#### Scenario: Moving east keeps the player visible

- **WHEN** the player moves east toward the right edge of a map wider than the screen
- **THEN** the map translates west so the player's tile stays within the visible viewport

#### Scenario: The player's tile stays in view through a sequence of moves

- **WHEN** the player performs a sequence of moves (including reaching the right or bottom edge of the map)
- **THEN** the player's tile remains within the viewport at every step

#### Scenario: The viewport clamps at a map edge

- **WHEN** the player moves within half a viewport of the map's left or top edge
- **THEN** the map does not translate past that edge (no blank margin appears beyond the map edge)

#### Scenario: A map smaller than the viewport is not offset

- **WHEN** the map is not wider (or not taller) than the viewport in an axis
- **THEN** the offset in that axis is zero

#### Scenario: The first render before measurement is safe

- **WHEN** the viewport has not yet reported its size on the first render
- **THEN** the map renders without error and adopts the correct camera offset once the viewport size is measured

### Requirement: The full map is still rendered under the viewport

The renderer SHALL continue to render one tile for every grid cell at the existing fixed tile size while presenting the map through the viewport; the camera SHALL change only how the map is positioned and clipped, not how many tiles are drawn.

#### Scenario: Every tile is still drawn

> Verified on-device / by implementation inspection; there are no node React Native render tests in this project (the known Stage-5 gap).

- **WHEN** the game screen renders a 40 by 30 level through the viewport
- **THEN** the map still contains one tile per cell of that level
