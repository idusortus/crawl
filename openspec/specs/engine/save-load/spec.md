# engine/save-load Specification

## Purpose
Defines how a run is persisted and resumed: the **full current game state** is saved as JSON together with the **full ordered command log** and an **`appliedCount` cursor** (how many commands from the log's head are already reflected in that state), and resuming deserializes that state and replays **only the remaining commands** (`commands.slice(appliedCount)`) so a saved run continues identically to an uninterrupted one. (The engine has no seed→initial-state primitive; "from the seed" means from the saved state, whose `rng.seed` is recorded.)

## Requirements

### Requirement: Save a run as JSON state plus a command log and an applied-count cursor

The engine SHALL provide a save representation that combines the JSON-serializable game state with the ordered command log for the run and an `appliedCount` cursor, so a full session can be persisted as plain JSON. The saved `state` SHALL be the full current state, the saved `commands` SHALL be the full command log for the run, and the saved `appliedCount` SHALL be the number of commands from the head of that log already reflected in the saved state.

#### Scenario: A run saves to plain JSON

- **WHEN** a run is saved
- **THEN** the save is JSON that can be serialized and parsed back without loss, and it contains the full current game state, the ordered commands applied, and the count of commands already reflected in that state

#### Scenario: The command log is ordered and complete

- **WHEN** a run has processed a sequence of commands
- **THEN** the saved command log contains **all** those commands in the order applied, and `appliedCount` names how many of the leading commands are already reflected in the saved state

#### Scenario: A mid-run save records a remaining-log cursor

- **WHEN** a save is taken partway through a run whose command log extends past the point the state reflects
- **THEN** `appliedCount` is less than the log length, so the commands after `appliedCount` are the unapplied remainder to replay on resume

### Requirement: A save declares a version that is checked on load

The save envelope SHALL carry a save-format version, and loading SHALL reject an unknown version loudly rather than mis-parsing the payload.

#### Scenario: Unknown save version is rejected

- **WHEN** a save is loaded whose version is not the one the engine supports
- **THEN** loading fails with an error naming the unsupported save version and produces no state

### Requirement: Resume a run by replaying the remaining command log from the saved state

Resuming SHALL reconstruct the run by deserializing the full saved state and replaying **only the remaining commands** (`commands.slice(appliedCount)`) from that state (with the pack when provided; the content-free entry point noops `use-item` when no pack is provided), producing a state and event stream identical to an uninterrupted run. The already-applied prefix (`commands.slice(0, appliedCount)`) SHALL NOT be replayed against the saved state. When no pack is supplied AND the unapplied remainder contains a content-dependent command (`use-item` or `descend`), replaying SHALL fail loudly with a typed error naming the offending command types rather than silently producing a state that diverges from the pack-aware run; this guard SHALL NOT alter the content-free entry point's own behavior for those commands, and a remainder with only content-free commands remains replayable without a pack.

#### Scenario: Resumed run matches an uninterrupted run

- **WHEN** a run is saved and then resumed by deserializing its state and replaying its remaining command log
- **THEN** the resumed state and emitted events match the uninterrupted run exactly

#### Scenario: A mid-run state plus its remaining log resumes correctly

- **WHEN** a save captures a mid-run state, the full command log, and an `appliedCount` less than the log length, and is resumed by replaying `commands.slice(appliedCount)` from that state
- **THEN** the resumed run matches an uninterrupted run continued past the same point

#### Scenario: A fully-applied save replays nothing

- **WHEN** a save's `appliedCount` equals its command-log length
- **THEN** resuming applies none of the log again, and the resumed state and events equal the uninterrupted run to that point

#### Scenario: Resume is deterministic

- **WHEN** the same save is resumed twice
- **THEN** both resumes produce identical state and events

#### Scenario: A save is inspectable without the content pack

- **WHEN** a saved run is inspected without the originating pack loaded
- **THEN** the save is well-formed and references content only by id, not by embedded objects

#### Scenario: Pack-free replay of a content-dependent remainder fails loudly

- **WHEN** a save is resumed without a pack and the unapplied remainder contains a `use-item` or `descend` command
- **THEN** resuming fails with a typed error naming the offending command types and produces no silently-diverged state

#### Scenario: Pack-free replay of a content-free remainder still succeeds

- **WHEN** a save is resumed without a pack and every command in the unapplied remainder is content-free (`move`, `attack`, or `pickup`)
- **THEN** the remainder replays without error

#### Scenario: Supplying a pack avoids the failure

- **WHEN** a save whose remainder contains a content-dependent command is resumed with the originating pack supplied
- **THEN** the remainder replays as before through the pack-aware entry point, with no typed replay error

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
