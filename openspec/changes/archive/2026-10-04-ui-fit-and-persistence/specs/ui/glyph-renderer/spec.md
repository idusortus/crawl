# Spec Delta — ui/glyph-renderer

## ADDED Requirements

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
