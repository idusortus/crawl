# Spec Delta

## MODIFIED Requirements

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

The renderer SHALL draw monsters, floor items, and the stairs on visible tiles, using the glyph supplied by the loaded content pack for each entity kind and a distinct `STAIRS_GLYPH` (e.g. `'>'`) for stairs (terrain has no pack glyph), with the player distinguishable from all of them. The stairs glyph SHALL also be drawn on an explored-but-not-currently-visible tile that holds the stairs, so a remembered stairs tile remains findable; monsters and floor items SHALL remain hidden on explored-but-not-visible tiles. `tileRender` SHALL accept a stairs input and the map view SHALL pass the level's stairs position.

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

#### Scenario: Occupants on explored-but-not-visible tiles are not shown

- **WHEN** a tile has been explored but is not currently visible and holds a monster or floor item
- **THEN** no monster or item is shown as an occupant on it (the flat terrain is shown), except that the stairs tile still shows `STAIRS_GLYPH`

### Requirement: The map viewport follows the player

The renderer SHALL size map tiles from the measured viewport width so the full level width is visible on screen (fit-to-width), rather than overflowing the screen horizontally. The rendered tile side length SHALL be `floor(measuredViewportWidth / grid.width)` (at least 1), uniform across the whole grid, and SHALL adapt when the viewport is re-measured. With the full width visible, the horizontal camera offset SHALL be zero. The renderer SHALL still position the map so the player's tile remains visible at all times and SHALL use a clamped, non-animating vertical camera when the fitted map is taller than the viewport; when the map is not taller than the viewport it SHALL be centered (zero vertical offset). The camera SHALL be a deterministic function of the player position and the measured viewport size.

#### Scenario: The full level width is visible

- **WHEN** the game screen renders a 40-tile-wide level on a phone-width viewport
- **THEN** the tile size is derived from the measured width so all 40 columns are on screen and no column overflows past either edge

#### Scenario: Sizing adapts to the measured viewport

- **WHEN** the viewport width changes (for example orientation or window resize)
- **THEN** the tile size is recomputed so the full level width remains visible

#### Scenario: Moving east keeps the player visible

- **WHEN** the player moves east toward the right edge of a level whose full width is on screen
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

### Requirement: The full map is still rendered under the viewport

The renderer SHALL continue to render one tile for every grid cell while presenting the map through the viewport; fitting the tile size SHALL change only how large and where each tile is drawn, not how many tiles are drawn.

#### Scenario: Every tile is still drawn

> Verified on-device / by implementation inspection; there are no node React Native render tests in this project (the known Stage-5 gap).

- **WHEN** the game screen renders a 40 by 30 level through the viewport
- **THEN** the map still contains one tile per cell of that level

#### Scenario: Fitting does not drop tiles

- **WHEN** the tile size is derived from a viewport narrower than the level's native width
- **THEN** every grid cell is still rendered at the same fitted tile size with no cell omitted
