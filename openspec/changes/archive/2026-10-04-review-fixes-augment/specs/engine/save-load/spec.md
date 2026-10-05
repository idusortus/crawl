# Spec Delta

## MODIFIED Requirements

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
