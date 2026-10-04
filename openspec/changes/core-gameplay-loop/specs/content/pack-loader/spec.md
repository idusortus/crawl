# Spec Delta

## MODIFIED Requirements

### Requirement: Resolve content by id

A loaded pack SHALL allow the engine to resolve a class, monster, or item by its id, and SHALL report a clear failure when an id is not present in the pack. The resolved monster entry SHALL expose its declarative behavior id and attack value so the engine can spawn and run it without embedding the entry in state.

#### Scenario: Known id resolves

- **WHEN** a class, monster, or item id present in the loaded pack is requested
- **THEN** the loader returns that entry

#### Scenario: Unknown id is reported, not silently empty

- **WHEN** an id not present in the loaded pack is requested
- **THEN** the loader reports the id as unknown rather than returning an ambiguous empty value

#### Scenario: A monster resolves with its behavior and attack

- **WHEN** a monster id present in the loaded pack is requested
- **THEN** the resolved entry exposes its behavior id and attack value for the engine to use when spawning that monster

## ADDED Requirements

### Requirement: The loader exposes spawnable content ids deterministically

The loader SHALL expose the pack's monster and item entries in a stable order so level generation and spawning can select kinds deterministically from the loaded pack.

#### Scenario: Spawnable kinds are enumerable in a stable order

- **WHEN** the loader is asked for the pack's monsters or items
- **THEN** it returns them in a stable, deterministic order suitable for seeded selection

#### Scenario: Selection is reproducible across loads

- **WHEN** the same pack is loaded twice and a kind is selected by seeded index
- **THEN** the selected kind is identical both times

### Requirement: Composition floor still holds with the new fields

The loader SHALL continue to require at least two classes, at least one monster, and at least one item, and a monster missing its behavior or attack SHALL fail loading as an actionable composition/schema error.

#### Scenario: Under-composed pack fails loading

- **WHEN** a pack has fewer classes, monsters, or items than the floor requires
- **THEN** loading fails with the actionable composition error

#### Scenario: Monster missing required combat fields fails loading

- **WHEN** a monster omits its behavior id or attack value
- **THEN** loading fails with an actionable error naming the offending entry and field
