# Spec Delta

## ADDED Requirements

### Requirement: Descend command

The engine SHALL accept a descend command that advances the player to a newly generated level at the next depth, placing the player at that level's spawn point and emitting an observable event, while preserving the command-in/event-out contract.

#### Scenario: Descending generates a deeper level

- **WHEN** a descend command is applied to a state on depth D
- **THEN** the returned state contains a newly generated level at depth D+1 and the player is placed at its spawn point

#### Scenario: Descending is deterministic from the seed

- **WHEN** the same descend command sequence is replayed from the same seed
- **THEN** the generated levels are identical, because generation draws only from the injected seeded source

#### Scenario: Descending is observable

- **WHEN** a descend command succeeds
- **THEN** an event is emitted describing the new level (at least the new depth) as plain serializable data appended to the log

#### Scenario: Input state is not mutated

- **WHEN** a descend command is applied
- **THEN** the input state is unchanged and a new state is returned

### Requirement: Level change resets per-level view state

When the player descends to a new level, the per-level view state SHALL be reset for the new level (its explored record starts fresh and is seeded from the new spawn), so tiles from the previous level do not leak into the new one.

#### Scenario: Explored record does not carry across levels

- **WHEN** the player descends to a new level
- **THEN** the explored record reflects only the new level and does not retain the previous level's tiles

#### Scenario: New level is immediately playable

- **WHEN** the player descends
- **THEN** the player is on a passable tile of the new level and can move normally

### Requirement: Descend composes with the existing contract

The descend addition SHALL preserve the existing command-loop guarantees: every command emits at least one event, unrecognized or malformed commands degrade to a no-op without throwing, and state remains JSON-serializable.

#### Scenario: Unknown command still degrades to no-op

- **WHEN** a command of an unrecognized type is applied after the union gains descend
- **THEN** the engine emits a no-op event and returns state equivalent to the input, without throwing

#### Scenario: Descend result is JSON-serializable

- **WHEN** a state produced by a descend command is serialized and parsed back
- **THEN** it round-trips without loss and behaves identically for further commands
