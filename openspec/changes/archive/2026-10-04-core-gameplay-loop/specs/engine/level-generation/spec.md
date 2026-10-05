# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
