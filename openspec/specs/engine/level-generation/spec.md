# engine/level-generation Specification

## Purpose
Deterministic, seeded construction of a connected dungeon level from a named generator, with a registry that lets new generators be added without changing the engine or game state.

## Requirements

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

A generated level SHALL report a spawn point on a passable tile, the depth it was generated for, and a stairs location on a passable tile distinct from the spawn, so the player can be placed, progression tracked, and descent made reachable.

#### Scenario: Spawn is on a passable tile

- **WHEN** a level is generated
- **THEN** its reported spawn point lies within bounds and on a passable tile

#### Scenario: Depth is recorded

- **WHEN** a level is generated for a given depth
- **THEN** the level reports that depth

#### Scenario: Stairs are reported on a passable tile

- **WHEN** a level is generated
- **THEN** it reports a stairs location within bounds, on a passable tile, and distinct from the spawn point

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

### Requirement: Generation places monsters, items, and stairs

Level generation SHALL place monsters and floor items and select a stairs location using only the injected seeded source, drawing generation, population, and stairs placement from **one shared `Rng` instance** (the caller captures `state.rng` only after all three complete), on passable tiles that are mutually distinct and distinct from the spawn, so the same seed and depth reproduce the same population.

#### Scenario: Generation reports the placed population

- **WHEN** a level is generated with a loaded content pack
- **THEN** the generated result reports the monsters, items, and stairs it placed

#### Scenario: Placement is deterministic

- **WHEN** the same seed, depth, and pack are used to generate a level twice
- **THEN** the monsters, items, and stairs are placed at identical positions with identical kinds

#### Scenario: A mid-run resume reproduces the same monsters and kinds

- **WHEN** a run is resumed (save-load or replay) past a level the engine populated
- **THEN** the monsters occupy the same positions with the same kinds as the uninterrupted run

#### Scenario: Placements do not overlap

- **WHEN** a level is generated
- **THEN** no monster, item, or the stairs occupies the spawn tile or the same tile as another placement

#### Scenario: Placement never makes the level unreachable

- **WHEN** a level is generated with its initial placements
- **THEN** every passable tile, including the stairs, remains reachable from the spawn over passable tiles

### Requirement: Generation stays framework-free and pack-agnostic

Generation SHALL select monster and item kinds from content supplied to it (a loaded pack or an equivalent id source) rather than embedding any content, and SHALL remain a pure, deterministic function with no ambient randomness.

#### Scenario: Kinds are selected from supplied content

- **WHEN** generation places monsters or items
- **THEN** each placed kind is an id taken from the supplied content, not a hardcoded engine value

#### Scenario: Generation uses no ambient randomness

- **WHEN** a level is generated
- **THEN** all placement randomness is drawn from the injected seeded source and no global random or time source is consulted
