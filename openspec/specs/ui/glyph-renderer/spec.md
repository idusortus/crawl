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

The renderer SHALL distinguish, for each tile, three states — currently visible, explored but not currently visible, and never seen — using different visual treatments. An explored-but-not-currently-visible tile SHALL show its terrain dimmed and SHALL NOT show a monster; a remembered floor item MAY be shown dimmed (see the drawing requirement below). A never-seen tile SHALL NOT reveal terrain or entity glyphs.

#### Scenario: Visible tile is drawn at full strength

- **WHEN** a tile is currently visible
- **THEN** its terrain and any entity glyph are drawn in the visible treatment

#### Scenario: Explored tile is drawn dimmed

- **WHEN** a tile has been explored but is not currently visible
- **THEN** its terrain is drawn in a distinct dimmed treatment, no current monster is shown, and any floor item is drawn dimmed

#### Scenario: Unseen tile reveals nothing

- **WHEN** a tile has never been explored
- **THEN** the tile is drawn in the unseen treatment and shows no terrain or entity glyph

### Requirement: A heads-up display shows progression and health

The renderer SHALL show the current dungeon depth and the player's current hit points, updating as state changes, and SHALL surface the run's terminal status so a dead player is not shown as a normal in-progress run. The HUD SHALL also show a discoverability aid for the current level's stairs — a direction and distance from the player to the stairs position — computed purely from state, so the player can find the stairs after the tile leaves field of view.

#### Scenario: Depth is displayed

- **WHEN** the player descends to a deeper level
- **THEN** the displayed depth reflects the new level's depth

#### Scenario: Player health is displayed

- **WHEN** the renderer is given a state whose player hit points value differs from another state's
- **THEN** the displayed hit points reflect the player's current value

#### Scenario: The stairs hint is displayed

- **WHEN** the current level has a stairs position and a player position
- **THEN** the HUD shows the stairs direction and distance derived from those positions

#### Scenario: The stairs hint updates with the player

- **WHEN** the player moves and the position-to-stairs relationship changes
- **THEN** the displayed stairs direction/distance reflects the new player position

#### Scenario: The terminal status is surfaced

- **WHEN** the run has ended
- **THEN** the renderer shows a game-over surface rather than the ordinary in-progress view

### Requirement: Monsters, items, and stairs are drawn from state using pack glyphs

The renderer SHALL draw monsters, floor items, and the stairs on visible tiles, using the glyph supplied by the loaded content pack for each entity kind and a distinct `STAIRS_GLYPH` (e.g. `'>'`) for stairs (terrain has no pack glyph), with the player distinguishable from all of them. The stairs glyph SHALL also be drawn on an explored-but-not-currently-visible tile that holds the stairs, and a floor item's glyph SHALL also be drawn on an explored-but-not-currently-visible tile that holds a floor item, each in the dimmed explored treatment, so remembered features remain findable; monsters SHALL remain hidden on explored-but-not-visible tiles. `tileRender` SHALL accept a stairs input and the map view SHALL pass the level's stairs position.

#### Scenario: A visible monster is drawn

- **WHEN** a monster occupies a visible tile
- **THEN** that tile shows the glyph the pack declares for that monster kind

#### Scenario: A visible item is drawn

- **WHEN** a floor item occupies a visible tile
- **THEN** that tile shows the glyph the pack declares for that item kind

#### Scenario: Stairs are drawn distinctly

- **WHEN** the stairs tile is visible
- **THEN** it is drawn with `STAIRS_GLYPH`, distinct from ordinary floor

#### Scenario: Remembered stairs stay drawn after leaving field of view

- **WHEN** the stairs tile has been explored but is not currently visible
- **THEN** the tile still shows `STAIRS_GLYPH` (dimmed), distinct from ordinary remembered floor

#### Scenario: A remembered item stays drawn dimmed

- **WHEN** a floor item sits on a tile that has been explored but is not currently visible
- **THEN** the tile shows the glyph the pack declares for that item kind, in the dimmed explored treatment

#### Scenario: Occupants on explored-but-not-visible tiles are not shown

- **WHEN** a tile has been explored but is not currently visible and holds a monster or floor item
- **THEN** no monster is shown as an occupant on it (the flat terrain is shown), a floor item is shown dimmed, and the stairs tile still shows `STAIRS_GLYPH`

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

At the default 1× zoom level, the renderer SHALL size map tiles from the measured viewport width so the full level width is visible on screen (fit-to-width), rather than overflowing the screen horizontally. The rendered tile side length at 1× SHALL be `floor(measuredViewportWidth / grid.width)` (at least 1), uniform across the whole grid, and SHALL adapt when the viewport is re-measured. With the full width visible at 1×, the horizontal camera offset SHALL be zero. At a non-default zoom level the tile side length SHALL be that 1× base multiplied by the current zoom factor (see the `ui/map-zoom` capability), so the full-width guarantee no longer applies at non-default zoom. At every zoom the renderer SHALL position the map so the player's tile remains visible at all times and SHALL use a clamped, non-animating vertical camera when the fitted map is taller than the viewport; when the map is not taller than the viewport it SHALL be centered (zero vertical offset). The camera SHALL be a deterministic function of the player position, the measured viewport size, and the current zoom.

#### Scenario: The full level width is visible

- **WHEN** the game screen renders a 40-tile-wide level at the default 1× zoom on a phone-width viewport
- **THEN** the tile size is derived from the measured width so all 40 columns are on screen and no column overflows past either edge

#### Scenario: Sizing adapts to the measured viewport

- **WHEN** the viewport width changes (for example orientation or window resize) at the default 1× zoom
- **THEN** the tile size is recomputed so the full level width remains visible

#### Scenario: Moving east keeps the player visible

- **WHEN** the player moves east toward the right edge of a level whose full width is on screen at 1× zoom
- **THEN** the player's tile remains within the visible viewport without a horizontal camera translation

#### Scenario: The player's tile stays in view through a sequence of moves

- **WHEN** the player performs a sequence of moves (including reaching the bottom edge of the fitted map when it is taller than the viewport)
- **THEN** the player's tile remains within the viewport at every step

#### Scenario: The viewport clamps at a map edge

- **WHEN** the player moves within half a viewport of the fitted map's top or bottom edge
- **THEN** the vertical camera does not translate past that edge (no blank margin appears beyond the map edge)

#### Scenario: A map smaller than the viewport is not offset

- **WHEN** the fitted map is not taller (or not wider) than the viewport in an axis
- **THEN** the offset in that axis is zero and the map is centered

#### Scenario: The first render before measurement is safe

- **WHEN** the viewport has not yet reported its size on the first render
- **THEN** the map renders without error at a safe default tile size and adopts the fitted size once the viewport is measured

#### Scenario: A zoom factor scales the base tile size

- **WHEN** the map is rendered at a zoom factor other than 1×
- **THEN** the tile side length is the 1× base size multiplied by that factor and the player's tile remains within the viewport

### Requirement: The full map is still rendered under the viewport

The renderer SHALL continue to render one tile for every grid cell while presenting the map through the viewport; fitting the tile size SHALL change only how large and where each tile is drawn, not how many tiles are drawn.

#### Scenario: Every tile is still drawn

> Verified on-device / by implementation inspection; there are no node React Native render tests in this project (the known Stage-5 gap).

- **WHEN** the game screen renders a 40 by 30 level through the viewport
- **THEN** the map still contains one tile per cell of that level

#### Scenario: Fitting does not drop tiles

- **WHEN** the tile size is derived from a viewport narrower than the level's native width
- **THEN** every grid cell is still rendered at the same fitted tile size with no cell omitted

### Requirement: The heads-up display describes the object underfoot

The renderer SHALL show a short description of the tile the player occupies when that tile holds a floor item or the level's stairs, and SHALL render no description line for an ordinary empty tile. For a floor item, the description SHALL be the pack item's name together with its optional `description` when the pack declares one, or a generic fallback detail otherwise; when the item's kind is absent from the loaded pack, the line SHALL show a safe generic label rather than throwing. When the tile holds the stairs and no floor item, the line SHALL describe the stairs as leading down. A floor item SHALL take precedence over the stairs when both share the player's tile.

#### Scenario: An item underfoot is described

- **WHEN** the player stands on a floor item whose pack entry declares a description
- **THEN** the HUD shows that item's name and its declared description

#### Scenario: An item without a description falls back

- **WHEN** the player stands on a floor item whose pack entry declares no description
- **THEN** the HUD shows the item's name with a generic fallback detail

#### Scenario: The stairs underfoot are described

- **WHEN** the player stands on the stairs tile with no floor item
- **THEN** the HUD shows a description of the stairs leading down

#### Scenario: An empty tile shows nothing

- **WHEN** the player stands on an ordinary empty tile
- **THEN** the HUD shows no object description line

#### Scenario: An unknown item kind degrades safely

- **WHEN** the player stands on a floor item whose kind is absent from the loaded pack
- **THEN** the HUD shows a safe generic label and the renderer does not crash

#### Scenario: An item takes precedence over the stairs

- **WHEN** a floor item and the stairs share the player's tile
- **THEN** the HUD describes the item rather than the stairs
