# Spec Delta

## Purpose

Deterministic, seeded construction of a connected dungeon level from a named generator, with a registry that lets new generators be added without changing the engine or game state.

## ADDED Requirements

### Requirement: Seeded deterministic generation

Level generation SHALL be a pure function of a seed and a depth, such that the same seed and depth produce an identical level, and generation SHALL NOT depend on any ambient source of randomness.

#### Scenario: Same seed and depth produce an identical level

- **WHEN** a level is generated twice from the same seed and depth
- **THEN** the two levels are equivalent in dimensions, passability, spawn point, and depth

#### Scenario: Different seeds produce different levels

- **WHEN** levels are generated from different seeds at the same depth
- **THEN** the generated layouts are not required to match, demonstrating the seed drives the layout

#### Scenario: No ambient randomness is used

- **WHEN** level generation runs
- **THEN** all randomness is drawn from the injected seeded source and no global random or time source is consulted

### Requirement: Generated levels are connected and bounded

A generated level SHALL declare explicit width and height, SHALL consist of passable floor regions surrounded by non-passable boundaries, and SHALL be connected — every passable tile SHALL be reachable from the player's spawn point.

#### Scenario: Level dimensions are explicit and bounded

- **WHEN** a level is generated for a given size
- **THEN** the level reports its width and height and every tile falls within those bounds

#### Scenario: The outer boundary is non-passable

- **WHEN** a generated level is inspected at its edges
- **THEN** the boundary tiles are non-passable, enclosing the playable area

#### Scenario: Every floor tile is reachable from spawn

- **WHEN** a generated level is searched from its spawn point over passable tiles
- **THEN** every passable tile is reached, so the player can never be sealed off from part of the level

### Requirement: Levels carry a spawn point and depth

A generated level SHALL report a spawn point on a passable tile and the depth it was generated for, so the player can be placed and progression tracked.

#### Scenario: Spawn is on a passable tile

- **WHEN** a level is generated
- **THEN** its reported spawn point lies within bounds and on a passable tile

#### Scenario: Depth is recorded

- **WHEN** a level is generated for a given depth
- **THEN** the level reports that depth

### Requirement: Generator selection is by named id

The engine SHALL select a level generator by a named id from a registry, and SHALL report a clear failure for an unknown generator id, so new generators can be added without changing existing state or the command loop.

#### Scenario: A known generator id is selected

- **WHEN** level generation is requested with a registered generator id
- **THEN** that generator produces the level

#### Scenario: An unknown generator id is reported

- **WHEN** level generation is requested with an unregistered generator id
- **THEN** the engine reports the id as unknown rather than silently falling back

#### Scenario: The default generator is used when none is named

- **WHEN** level generation is requested without naming a generator
- **THEN** the engine uses a default registered generator
