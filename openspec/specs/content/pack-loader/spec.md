# content/pack-loader Specification

## Purpose
Defines how a validated content pack is loaded and made available to the engine by id, without embedding content inside serializable game state.

## Requirements

### Requirement: Load and validate a pack

The loader SHALL read a pack, validate it against the pack schema, and return a usable pack when valid, failing with the validation error when invalid.

#### Scenario: Valid pack loads successfully

- **WHEN** the loader is given a well-formed pack that satisfies the schema
- **THEN** it returns a loaded pack made available for id lookup

#### Scenario: Invalid pack does not load

- **WHEN** the loader is given a pack that fails schema validation
- **THEN** it fails with the actionable validation error and yields no loaded pack

### Requirement: Resolve content by id

A loaded pack SHALL allow the engine to resolve a class, monster, or item by its id, and SHALL report a clear failure when an id is not present in the pack. The resolved monster entry SHALL expose its declarative behavior id and attack value, and the resolved class entry SHALL expose its attack value, so the engine can spawn and run them without embedding the entry in state.

#### Scenario: Known id resolves

- **WHEN** a class, monster, or item id present in the loaded pack is requested
- **THEN** the loader returns that entry

#### Scenario: Unknown id is reported, not silently empty

- **WHEN** an id not present in the loaded pack is requested
- **THEN** the loader reports the id as unknown rather than returning an ambiguous empty value

#### Scenario: A monster resolves with its behavior and attack

- **WHEN** a monster id present in the loaded pack is requested
- **THEN** the resolved entry exposes its behavior id and attack value for the engine to use when spawning that monster

### Requirement: Content is not embedded in game state

A loaded pack SHALL live outside serializable game state; game state SHALL reference content only by id, so saves stay small and replayable across pack revisions.

#### Scenario: Game state references content by id only

- **WHEN** an entity in game state is associated with pack content
- **THEN** game state stores the content id, and the pack's full entry is not copied into the state

#### Scenario: State remains valid without the pack loaded

- **WHEN** a saved game state is inspected without the originating pack present
- **THEN** the state is well-formed and its content references are still ids, not dangling objects

### Requirement: Deterministic load

Loading the same pack SHALL produce the same resolved content regardless of ambient factors, so a run is reproducible.

#### Scenario: Same pack loads identically

- **WHEN** the same pack is loaded twice
- **THEN** the resolved content is equivalent and any resulting engine behavior is identical

### Requirement: The loader exposes spawnable content ids deterministically

The loader SHALL expose the pack's monster and item entries in a stable order so level generation and spawning can select kinds deterministically from the loaded pack.

#### Scenario: Spawnable kinds are enumerable in a stable order

- **WHEN** the loader is asked for the pack's monsters or items
- **THEN** it returns them in a stable, deterministic order suitable for seeded selection

#### Scenario: Selection is reproducible across loads

- **WHEN** the same pack is loaded twice and a kind is selected by seeded index
- **THEN** the selected kind is identical both times

### Requirement: Composition floor still holds with the new fields

The loader SHALL continue to require at least two classes, at least one monster, and at least one item, and a monster missing its behavior or attack, **or a class missing its attack**, SHALL fail loading as an actionable composition/schema error.

#### Scenario: Under-composed pack fails loading

- **WHEN** a pack has fewer classes, monsters, or items than the floor requires
- **THEN** loading fails with the actionable composition error

#### Scenario: Monster missing required combat fields fails loading

- **WHEN** a monster omits its behavior id or attack value
- **THEN** loading fails with an actionable error naming the offending entry and field

#### Scenario: Class missing its attack fails loading

- **WHEN** a class omits its attack value
- **THEN** loading fails with an actionable error naming the offending class entry and the missing `attack` field
