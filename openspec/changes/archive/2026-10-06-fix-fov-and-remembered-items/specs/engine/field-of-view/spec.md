# Spec Delta

## MODIFIED Requirements

### Requirement: Visibility from an origin

The engine SHALL compute the set of tiles visible from an origin within a sight radius, where a tile is visible only if its line of sight is not blocked by a non-passable tile and does not pass through a diagonal gap between two non-passable tiles (a corner where two non-passable tiles touch diagonally). A tile seen around the end of a single wall, where at least one of the two tiles forming the corner is passable, remains visible.

#### Scenario: Open area is visible

- **WHEN** visibility is computed from an origin in an open, passable area within the sight radius
- **THEN** the tiles in that area up to the radius are marked visible

#### Scenario: Walls block sight

- **WHEN** a non-passable tile lies between the origin and a farther tile
- **THEN** the farther tile is not marked visible, while the blocking wall itself is

#### Scenario: A diagonal gap between two walls blocks sight

- **WHEN** a tile is reached only diagonally through a corner where both flanking tiles are non-passable
- **THEN** that tile is not marked visible

#### Scenario: Sight around the end of a single wall is retained

- **WHEN** a tile lies diagonally past a wall end where exactly one of the two flanking tiles at the corner is non-passable
- **THEN** that tile is marked visible

#### Scenario: The origin is always visible

- **WHEN** visibility is computed from an origin on a passable tile
- **THEN** the origin tile itself is marked visible

#### Scenario: Sight is bounded by radius

- **WHEN** visibility is computed with a sight radius, measured as Chebyshev distance (the greater of the horizontal and vertical offsets)
- **THEN** no tile whose Chebyshev distance from the origin exceeds the radius is marked visible

#### Scenario: A reasonable default sight radius applies

- **WHEN** a default sight radius is used for an observer at a position in an open area
- **THEN** tiles are visible out to that radius and not beyond it
