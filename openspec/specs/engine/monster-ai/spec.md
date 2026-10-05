# engine/monster-ai Specification

## Purpose
Defines how a generated level is populated with monsters drawn from the loaded content pack, and how those monsters act on each turn through a deterministic, seeded behavior selected by a named registry id.

## Requirements

### Requirement: Monsters populate a generated level

A generated level SHALL be populated with monsters drawn from the loaded content pack, placed on passable tiles that are distinct from the player's spawn and from each other, with all placement randomness drawn from the injected seeded source. Each monster entity SHALL copy the resolved behavior id and attack value onto itself at spawn, so the engine runs it without a pack lookup.

#### Scenario: A level is populated with monsters

- **WHEN** a level is generated with a loaded content pack and a seeded source
- **THEN** the resulting state contains one or more monster entities whose kinds are ids present in the pack, each on a passable tile

#### Scenario: A monster carries its behavior id and attack as plain entity data

- **WHEN** a monster is placed
- **THEN** its entity carries the resolved behavior id and attack value as plain serializable fields, and does not embed the pack entry

#### Scenario: Monsters do not spawn on the player

- **WHEN** monsters are placed
- **THEN** no monster occupies the player's spawn tile

#### Scenario: Monster placement is deterministic

- **WHEN** the same seed, depth, and pack are used
- **THEN** the monsters are placed at the same positions with the same kinds

#### Scenario: Monster kinds come from the pack

- **WHEN** monsters are placed
- **THEN** each monster references a pack content id and does not embed the pack entry in state

### Requirement: Monsters advance deterministically each turn

On each turn that the run is in progress, every living monster SHALL act exactly once, in a deterministic order, drawing any randomness from the injected seeded source, so a replayed command log reproduces the same monster actions.

#### Scenario: Every monster acts once per turn

- **WHEN** the player takes a turn and monsters are alive
- **THEN** each living monster takes exactly one action before the next player command

#### Scenario: Monster turns are deterministic

- **WHEN** the same seed and command sequence are replayed
- **THEN** the monsters take the same actions in the same order

#### Scenario: Monsters do not act after game over

- **WHEN** the run has ended
- **THEN** monsters take no actions

### Requirement: Behavior is selected by a named registry id

A monster's behavior SHALL be selected by a named behavior id resolved through an engine-owned registry that maps ids to pure behavior implementations; content SHALL supply only the id, never executable logic.

#### Scenario: A known behavior id is resolved

- **WHEN** a monster's behavior id is registered
- **THEN** the engine advances the monster using that behavior's implementation

#### Scenario: An unknown behavior id is handled safely

- **WHEN** a monster's behavior id is not registered
- **THEN** the engine degrades to a safe default behavior (such as doing nothing) without throwing

#### Scenario: Behavior is data, not code

- **WHEN** a content pack declares a monster behavior
- **THEN** the pack supplies only a named id and the engine contains no pack-supplied functions or scripts

### Requirement: A monster pursues and attacks when the player is reachable

A pursuing behavior SHALL move a monster toward the player when the player is visible or within range, and SHALL attack the player when adjacent, resolving combat through the same combat rules as the player's attacks.

#### Scenario: An adjacent monster attacks the player

- **WHEN** a pursuing monster is adjacent to the player at the start of its turn
- **THEN** it attacks the player through the combat rules and the player's hit points may be reduced

#### Scenario: A monster approaches a visible player

- **WHEN** a pursuing monster can see the player within its behavior's range and is not adjacent
- **THEN** it takes a step that reduces its distance to the player, subject to passability and occupancy

#### Scenario: A monster that cannot reach the player does not pass through walls

- **WHEN** a monster's path toward the player is blocked
- **THEN** it does not move onto a non-passable or occupied tile

### Requirement: Monster AI is pure and serializable

Monster behavior SHALL be a pure function of serializable game state and the injected seeded source, and SHALL NOT introduce non-serializable data or ambient randomness into state.

#### Scenario: Monster actions use no ambient sources

- **WHEN** monsters act
- **THEN** all randomness flows through the injected seeded source and no global random or time source is used

#### Scenario: Monster state round-trips

- **WHEN** state containing monsters is serialized and parsed back
- **THEN** the monsters and their positions round-trip without loss and behave identically
