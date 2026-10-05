# Spec Delta

## MODIFIED Requirements

### Requirement: Seeded deterministic generation

Level generation SHALL be a pure function of a seed and a depth, such that the same seed and depth produce an identical level, and generation SHALL NOT depend on any ambient source of randomness. The seeded output SHALL be a **pinned contract**: for a given `(seed, depth)` and level dimensions, the reported spawn and stairs tiles are fixed expected values, so a change to the draw order that shifts the seeded output is a contract change and is detected rather than silently accepted.

#### Scenario: Same seed and depth produce an identical level

- **WHEN** a level is generated twice from the same seed and depth
- **THEN** the two levels are equivalent in dimensions, passability, spawn point, and depth

#### Scenario: Different seeds produce different levels

- **WHEN** levels are generated from different seeds at the same depth
- **THEN** the generated layouts are not required to match, demonstrating the seed drives the layout

#### Scenario: No ambient randomness is used

- **WHEN** level generation runs
- **THEN** all randomness is drawn from the injected seeded source and no global random or time source is consulted

#### Scenario: The seeded spawn and stairs are a pinned value

- **WHEN** a level is generated for a fixed tuple of seed, depth, width, and height
- **THEN** the reported spawn and stairs tiles equal the frozen expected values for that tuple, so a change to draw order is observable as a failing contract

### Requirement: Generation places monsters, items, and stairs

Level generation SHALL place monsters and floor items and select a stairs location using only the injected seeded source, drawing generation, population, and stairs placement from **one shared `Rng` instance** (the caller captures `state.rng` only after all three complete), on passable tiles that are mutually distinct and distinct from the spawn, so the same seed and depth reproduce the same population. The seeded initial placements SHALL be a **pinned contract**: for a fixed `(seed, depth, dimensions, pack)`, the placed monster and item positions and kinds are fixed expected values, so a change to the placement draw order is detected.

#### Scenario: Generation reports the placed population

- **WHEN** a level is generated with a loaded content pack
- **THEN** the generated result reports the monsters, items, and stairs it placed

#### Scenario: Placement is deterministic

- **WHEN** the same seed, depth, and pack are used to generate a level twice
- **THEN** the monsters, items, and stairs are placed at identical positions with identical kinds

#### Scenario: The seeded initial placements are a pinned value

- **WHEN** a level is generated and populated for a fixed tuple of seed, depth, dimensions, and pack
- **THEN** each placed monster's and item's position and kind equal the frozen expected values for that tuple, so a change to the placement draw order is observable as a failing contract

#### Scenario: A mid-run resume reproduces the same monsters and kinds

- **WHEN** a run is resumed (save-load or replay) past a level the engine populated
- **THEN** the monsters occupy the same positions with the same kinds as the uninterrupted run

#### Scenario: Placements do not overlap

- **WHEN** a level is generated
- **THEN** no monster, item, or the stairs occupies the spawn tile or the same tile as another placement

#### Scenario: Placement never makes the level unreachable

- **WHEN** a level is generated with its initial placements
- **THEN** every passable tile, including the stairs, remains reachable from the spawn over passable tiles
