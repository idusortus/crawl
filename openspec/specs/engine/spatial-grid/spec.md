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

Applying a directional move command to an entity SHALL resolve against the target tile and any occupant, emitting a moved event when the step succeeds and a blocked event when it is refused, without leaving the entity on an invalid tile. When the occupant is a living entity that can be attacked, the engine SHALL treat the intent as an attack rather than a plain refusal, so walking into a monster attacks it.

#### Scenario: Move into a passable empty tile succeeds

- **WHEN** an entity attempts to move into an in-bounds, passable tile that is not occupied by a blocking entity
- **THEN** the entity's position advances by the requested direction and a moved event is emitted

#### Scenario: Move into a non-passable tile is blocked

- **WHEN** an entity attempts to move into a tile that is non-passable
- **THEN** the entity's position does not change and a blocked event is emitted

#### Scenario: Move out of bounds is blocked

- **WHEN** an entity attempts to move beyond the grid boundary
- **THEN** the entity's position does not change and a blocked event is emitted

#### Scenario: Moving into a living occupant attacks instead of moving

- **WHEN** the player attempts to move into a tile occupied by a living monster
- **THEN** the engine resolves an attack against that monster and does not move the player onto the occupied tile

### Requirement: The world is a level, not a bare grid

Game state SHALL represent the current level as the grid plus level metadata (at least depth and the spawn point), and SHALL carry a per-level explored mask, so the world has progression and memory rather than being a single static grid.

#### Scenario: State carries level metadata

- **WHEN** a level is loaded into game state
- **THEN** the state reports the level's depth and spawn point alongside the grid

#### Scenario: State carries an explored mask

- **WHEN** a level is loaded into game state
- **THEN** the state includes an explored record aligned with the grid's dimensions

#### Scenario: Level data stays JSON-clean

- **WHEN** game state containing a level and explored mask is serialized and parsed back
- **THEN** the level and explored data round-trip without loss and behave identically for further commands

### Requirement: Movement updates explored tiles

When an entity moves on the current level, the engine SHALL update the explored record with the tiles currently visible from its new position, so exploring the level is a side effect of movement.

#### Scenario: Moving reveals on the way

- **WHEN** the player moves to a new tile
- **THEN** tiles visible from the new position are added to the explored record, and previously explored tiles are retained

#### Scenario: Blocked movement does not corrupt the level

- **WHEN** a move is blocked
- **THEN** the level, spawn, and explored record are unchanged apart from any event logging

### Requirement: Entering a level marks the player's vicinity explored

When the player enters a level (including a freshly generated one), the explored record SHALL reflect tiles visible from the spawn point.

#### Scenario: Spawn vicinity is explored on entry

- **WHEN** the player enters a level
- **THEN** the tiles visible from the player's position on entry are marked explored

### Requirement: Occupancy distinguishes living entities from terrain features

The world SHALL classify every tile occupant totally: a living entity is an attack target, a terrain feature (stairs or a floor item carrying the item discriminator) is enterable, and any other non-living occupant is blocking, allowing a player to stand on and interact with a feature tile while still being blocked or attacking for a living occupant.

#### Scenario: A terrain feature tile is enterable

- **WHEN** the player moves onto a tile occupied by a non-blocking feature such as stairs or a floor item (one carrying the item discriminator)
- **THEN** the move succeeds and the player stands on that tile

#### Scenario: A living occupant is an attack target

- **WHEN** a tile is occupied by a living monster
- **THEN** the engine reports it as an attack target rather than as a plain blocking terrain

#### Scenario: A non-living, non-feature occupant is blocked

- **WHEN** the player moves onto a tile occupied by an entity that is neither living (no hit points) nor a feature (no item discriminator, not the stairs tile) — such as a plain content-free fixture
- **THEN** the move is refused, the player's position does not change, and a blocked event is emitted

#### Scenario: Feature and occupant data stay JSON-clean

- **WHEN** state carrying feature-bearing tiles and their occupants is serialized and parsed back
- **THEN** the data round-trips without loss and the engine classifies occupancy identically
