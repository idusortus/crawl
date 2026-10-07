# Spec Delta

## MODIFIED Requirements

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
