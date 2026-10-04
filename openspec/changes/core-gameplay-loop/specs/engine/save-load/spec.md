# Spec Delta

## Purpose

Defines how a run is persisted and resumed: game state is saved as JSON together with the JSON command log, and resuming replays that log from the recorded seed so a saved run continues identically to an uninterrupted one.

## ADDED Requirements

### Requirement: Save a run as JSON state plus a command log

The engine SHALL provide a save representation that combines the JSON-serializable game state with the ordered command log for the run, so a full session can be persisted as plain JSON.

#### Scenario: A run saves to plain JSON

- **WHEN** a run is saved
- **THEN** the save is JSON that can be serialized and parsed back without loss, and it contains the game state and the ordered commands applied

#### Scenario: The command log is ordered and complete

- **WHEN** a run has processed a sequence of commands
- **THEN** the saved command log contains those commands in the order applied

### Requirement: Resume a run by replaying the command log

Resuming SHALL reconstruct the run from the saved seed and the command log by replaying the commands, producing a state and event stream identical to an uninterrupted run.

#### Scenario: Resumed run matches an uninterrupted run

- **WHEN** a run is saved and then resumed by replaying its command log from its seed
- **THEN** the resumed state and emitted events match the uninterrupted run exactly

#### Scenario: Resume is deterministic

- **WHEN** the same save is resumed twice
- **THEN** both resumes produce identical state and events

#### Scenario: A save is inspectable without the content pack

- **WHEN** a saved run is inspected without the originating pack loaded
- **THEN** the save is well-formed and references content only by id, not by embedded objects

### Requirement: Saving and resuming do not corrupt state

Saving SHALL NOT mutate the run, and resuming SHALL produce a state that supports further commands under the normal command-in/event-out contract.

#### Scenario: Saving leaves the live run unchanged

- **WHEN** a run is saved
- **THEN** the live state is unchanged and continues to accept commands identically

#### Scenario: A resumed run accepts further commands

- **WHEN** a run is resumed
- **THEN** applying a further command to the resumed state advances it under the same contract as a never-saved run

### Requirement: Saved state is JSON-serializable

The saved game state SHALL contain only plain data — no class instances, functions, or non-JSON collections — so serialization and deserialization round-trip without loss.

#### Scenario: State round-trips through JSON

- **WHEN** a saved state is converted to JSON and parsed back
- **THEN** the parsed state is equivalent to the original and behaves identically when further commands are applied

#### Scenario: No non-serializable data is persisted

- **WHEN** a run is saved
- **THEN** every persisted field is a primitive, a plain object, or an array thereof
