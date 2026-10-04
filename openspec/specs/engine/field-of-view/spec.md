# engine/field-of-view Specification

## Purpose
Computes which tiles are currently visible from an observer's position using recursive shadowcasting, and maintains the persistent record of tiles the observer has ever seen.

## Requirements

### Requirement: Visibility from an origin

The engine SHALL compute the set of tiles visible from an origin within a sight radius, where a tile is visible only if its line of sight is not blocked by a non-passable tile.

#### Scenario: Open area is visible

- **WHEN** visibility is computed from an origin in an open, passable area within the sight radius
- **THEN** the tiles in that area up to the radius are marked visible

#### Scenario: Walls block sight

- **WHEN** a non-passable tile lies between the origin and a farther tile
- **THEN** the farther tile is not marked visible, while the blocking wall itself is

#### Scenario: The origin is always visible

- **WHEN** visibility is computed from an origin on a passable tile
- **THEN** the origin tile itself is marked visible

#### Scenario: Sight is bounded by radius

- **WHEN** visibility is computed with a sight radius, measured as Chebyshev distance (the greater of the horizontal and vertical offsets)
- **THEN** no tile whose Chebyshev distance from the origin exceeds the radius is marked visible

#### Scenario: A reasonable default sight radius applies

- **WHEN** a default sight radius is used for an observer at a position in an open area
- **THEN** tiles are visible out to that radius and not beyond it

### Requirement: Out-of-bounds or non-passable origin is handled safely

Computing visibility from an origin that is outside the grid bounds SHALL mark no tiles visible and SHALL NOT throw; computing from a non-passable origin SHALL still mark that origin tile visible.

#### Scenario: Origin outside the grid yields no visible tiles

- **WHEN** visibility is computed from an origin outside the grid bounds
- **THEN** no tiles are marked visible and the call does not throw

#### Scenario: Non-passable origin is itself visible

- **WHEN** visibility is computed from an origin on a non-passable tile within bounds
- **THEN** at least the origin tile is marked visible and the call does not throw

### Requirement: Visibility is deterministic and pure

Visibility SHALL be a pure function of the grid, the origin, and the radius, producing the same result every time for the same inputs, with no mutation of the grid or game state.

#### Scenario: Repeated computation matches

- **WHEN** visibility is computed twice from the same grid, origin, and radius
- **THEN** the two results are identical

#### Scenario: Inputs are not mutated

- **WHEN** visibility is computed
- **THEN** the grid and state passed in are unchanged

### Requirement: Explored tiles persist

The engine SHALL maintain an explored record that is the union of every tile ever visible during a level, and it SHALL only ever grow while on that level, so previously seen areas remain known. The **rules for when the explored record is updated** (on movement, on level entry, and reset on descending) are defined normatively by the `engine/spatial-grid` and `engine/command-loop` capabilities; this capability defines only the pure visibility computation and the append-only union property.

#### Scenario: Seen tiles remain explored after leaving

- **WHEN** a tile becomes visible and the observer then moves so the tile is no longer visible
- **THEN** the tile remains in the explored record

#### Scenario: Exploring accumulates

- **WHEN** the observer moves through a level across several positions
- **THEN** the explored record contains every tile that was visible from any of those positions

#### Scenario: Explored record is serializable

- **WHEN** game state containing the explored record is serialized and parsed back
- **THEN** the explored record round-trips without loss
