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

A loaded pack SHALL allow the engine to resolve a class, monster, or item by its id, and SHALL report a clear failure when an id is not present in the pack.

#### Scenario: Known id resolves

- **WHEN** a class, monster, or item id present in the loaded pack is requested
- **THEN** the loader returns that entry

#### Scenario: Unknown id is reported, not silently empty

- **WHEN** an id not present in the loaded pack is requested
- **THEN** the loader reports the id as unknown rather than returning an ambiguous empty value

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
