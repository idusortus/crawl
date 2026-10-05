# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
