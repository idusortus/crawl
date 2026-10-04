# engine/spatial-grid Specification

## Purpose
Defines the two-dimensional world model — a bounded grid of tiles and plain-data entities occupying it — and the rules by which a moving entity's intended step resolves against that grid.

## Requirements

### Requirement: Bounded 2D tile grid

The engine SHALL represent the world as a two-dimensional grid of tiles with explicit width and height, where each tile has a passability state, and it SHALL reject access to coordinates outside the grid bounds.

#### Scenario: In-bounds coordinate resolves to a tile

- **WHEN** a coordinate within the grid's width and height is queried
- **THEN** the engine returns that tile's passability state

#### Scenario: Out-of-bounds coordinate is handled safely

- **WHEN** a coordinate outside the grid bounds is queried
- **THEN** the engine reports it as not passable and never reads undefined tile data

### Requirement: Entities are plain data

An entity SHALL be a JSON-serializable data record identified by a stable id and a kind, with a position on the grid and additional plain-data properties, and SHALL NOT be a class instance or a behavior-carrying object.

#### Scenario: Entity is serializable

- **WHEN** an entity is part of game state that is serialized and deserialized
- **THEN** the entity's id, kind, position, and properties are preserved exactly

#### Scenario: Entities occupy grid positions

- **WHEN** an entity is placed at a coordinate on the grid
- **THEN** the engine can report which entity, if any, occupies a given coordinate

### Requirement: Movement resolution

Applying a directional move command to an entity SHALL resolve against the target tile and any occupant, emitting a moved event when the step succeeds and a blocked event when it is refused, without leaving the entity on an invalid tile.

#### Scenario: Move into a passable empty tile succeeds

- **WHEN** an entity attempts to move into an in-bounds, passable tile that is not occupied by a blocking entity
- **THEN** the entity's position advances by the requested direction and a moved event is emitted

#### Scenario: Move into a non-passable tile is blocked

- **WHEN** an entity attempts to move into a tile that is non-passable
- **THEN** the entity's position does not change and a blocked event is emitted

#### Scenario: Move out of bounds is blocked

- **WHEN** an entity attempts to move beyond the grid boundary
- **THEN** the entity's position does not change and a blocked event is emitted
