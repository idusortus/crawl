# ui/map-zoom Specification

## Purpose

Lets the player zoom the dungeon map in and out so glyphs can be read and tiles tapped at a comfortable scale, without changing game state or gameplay.

## Requirements

### Requirement: The map can be zoomed in and out

The client SHALL provide controls to zoom the map in and out, changing the rendered tile side length by a discrete zoom factor applied to the fit-to-width base scale. The zoom factor SHALL be bounded between a minimum and a maximum, and a zoom-in at the maximum or a zoom-out at the minimum SHALL be a no-op. The current zoom level SHALL be observable to the player.

#### Scenario: Zooming in enlarges tiles

- **WHEN** the player activates zoom-in from the default 1× level
- **THEN** the rendered tile side length increases by the zoom factor over the fit-to-width base and the map draws fewer, larger tiles

#### Scenario: Zooming out shrinks tiles

- **WHEN** the player activates zoom-out
- **THEN** the rendered tile side length decreases toward the fit-to-width base and the map draws smaller tiles

#### Scenario: Zoom is bounded

- **WHEN** the player activates zoom-in at the maximum level or zoom-out at the minimum level
- **THEN** the zoom level does not change beyond the bound

#### Scenario: The current zoom level is observable

- **WHEN** the zoom changes
- **THEN** the controls reflect the current zoom level

### Requirement: Zoom preserves the player's visibility and exact hit-testing

At every zoom level the renderer SHALL keep the player's tile within the viewport, SHALL NOT translate the map past a map edge into blank margin, and SHALL resolve a tap to the tile actually drawn under the touch point. The camera and hit-testing SHALL remain deterministic functions of the player position, the measured viewport, and the current zoom.

#### Scenario: The player stays visible when zoomed in

- **WHEN** the player moves to an edge of the map while zoomed in beyond the viewport
- **THEN** the camera translates so the player's tile remains within the viewport and no blank margin appears past the map edge

#### Scenario: Taps land on the drawn tile at any zoom

- **WHEN** the map is zoomed and the player taps a tile
- **THEN** the tap resolves to the tile rendered under the touch point at that zoom

#### Scenario: A zoomed-out map smaller than the viewport is centered

- **WHEN** a zoom makes the fitted map smaller than the viewport on an axis
- **THEN** the map is centered on that axis with no camera translation

### Requirement: Zoom is ephemeral and never enters game state

The zoom level SHALL be presentation-only client state that never enters `GameState`, the command log, or the serialized save, and changing it SHALL dispatch no command. Saving, resuming, and starting a new run SHALL not be affected by the zoom level.

#### Scenario: Zoom does not appear in serialized state

- **WHEN** a run is serialized with a non-default zoom
- **THEN** the serialized state contains no zoom field

#### Scenario: Zooming dispatches no command

- **WHEN** the player changes the zoom
- **THEN** no command is added to the log and game state is unchanged
