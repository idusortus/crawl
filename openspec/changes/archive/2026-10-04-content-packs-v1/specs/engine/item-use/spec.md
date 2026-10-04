# Spec Delta

## Purpose

Defines the first content-driven action: an entity uses an item resolved through the loaded pack, producing a seeded-random effect and an observable outcome.

## ADDED Requirements

### Requirement: Use an item by id

The engine SHALL accept a command to use an item identified by id, resolve that item through the loaded content pack, and apply its effect to the acting entity.

#### Scenario: Using a known item applies its effect

- **WHEN** a use-item command naming an item present in the pack is applied to a state whose actor exists
- **THEN** the item's effect is applied to the actor and an event describing the outcome is emitted, with the input state unchanged

#### Scenario: Using an unknown item is rejected without corruption

- **WHEN** a use-item command names an item not present in the loaded pack
- **THEN** the engine emits a no-op or error event and returns state equivalent to the input, without throwing

#### Scenario: Using an item with no actor is rejected without corruption

- **WHEN** a use-item command is applied but the acting entity does not exist in the state
- **THEN** the engine emits a no-op event and leaves the state equivalent to the input

### Requirement: Item effects draw from the injected random source

Where an item's effect is random, the outcome SHALL be drawn from the injected seeded random source, so the same seed and command sequence reproduce the same result.

#### Scenario: Same seed reproduces the same effect

- **WHEN** the same use-item command is applied twice from the same seed and identical state
- **THEN** the effect, the resulting state, and the emitted event are identical

#### Scenario: Different seeds can diverge

- **WHEN** the same use-item command is applied from two different seeds
- **THEN** the random effect may differ, demonstrating the outcome is driven by the injected seed and not any ambient source

### Requirement: Item use is observable

Using an item SHALL emit at least one event that reports the acting entity, the item id, and the effect that occurred, as plain serializable data recorded in the append-only log.

#### Scenario: Outcome event reports actor, item, and effect

- **WHEN** an item is successfully used
- **THEN** an event is emitted carrying the acting entity id, the item id, and the effect applied, and the event is appended to the log in order

#### Scenario: Item use is JSON-serializable

- **WHEN** a state produced by a use-item command is serialized and parsed back
- **THEN** the event and state round-trip without loss and behave identically for further commands
