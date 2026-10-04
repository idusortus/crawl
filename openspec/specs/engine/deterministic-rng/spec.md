# engine/deterministic-rng Specification

## Purpose
Provides a reproducible, injectable source of randomness so that a run is fully determined by its seed and the sequence of commands it processes.

## Requirements

### Requirement: Seeded reproducibility

The engine SHALL derive all randomness from an injected random source initialized from a seed, such that the same seed and the same sequence of commands produce identical results.

#### Scenario: Identical seed and commands yield identical results

- **WHEN** two runs are started with the same seed and are given the same sequence of commands
- **THEN** every event emitted by the second run matches the first run in type, order, and payload

#### Scenario: Different seeds diverge

- **WHEN** two runs use different seeds but receive the same command sequence that depends on randomness
- **THEN** their emitted events are not required to match, demonstrating the seed controls outcomes

### Requirement: Random source state travels with game state

The random source state SHALL be part of JSON-serializable game state, and SHALL be advanced only through the command loop, never by ambient sources.

#### Scenario: Random state is serializable and restorable

- **WHEN** game state is serialized after a command and later deserialized
- **THEN** continuing to apply commands from the restored state produces events identical to an uninterrupted run

#### Scenario: No ambient randomness is used

- **WHEN** the engine module is inspected or exercised in tests
- **THEN** it uses no global time or global random source, and all randomness flows through the injected random source

### Requirement: Bounded random draws

The random source SHALL expose deterministic integer draws within an inclusive range, suitable for dice-like and index-selection use by the engine.

#### Scenario: Draws stay within bounds and repeat

- **WHEN** a bounded integer draw between a minimum and maximum is requested repeatedly from a fixed seed
- **THEN** every returned value is within the inclusive range and the sequence repeats exactly when replayed from the same seed
