# Spec Delta

## ADDED Requirements

### Requirement: Ranged attack command

The engine SHALL accept a `ranged-attack` command carrying an explicit target position, resolved on the pack-aware entry point because it must look up the equipped weapon's range and damage from the loaded pack. The command SHALL follow the existing command-in / event-out contract: it is plain serializable data, it emits at least one event, it never mutates the input state, malformed parameters (a missing or non-numeric target coordinate) degrade to `noop('malformed-command')`, and a state with no loaded pack treats it as an unknown command rather than reaching for an ambient pack. A successful ranged hit SHALL advance monsters on the same turn rule as a successful melee attack hit.

#### Scenario: A ranged attack emits new state and events

- **WHEN** a well-formed ranged attack is applied through the pack-aware entry point with a loaded pack
- **THEN** the engine returns a new state and at least one event under the same contract as existing commands, and the input state is unchanged

#### Scenario: A malformed ranged attack degrades to a no-op

- **WHEN** a ranged attack omits its target or carries non-numeric coordinates
- **THEN** the engine emits `noop('malformed-command')` and returns state equivalent to the input, without throwing

#### Scenario: The content-free entry point treats ranged attack as unknown

- **WHEN** a ranged attack is applied through the content-free entry point with no pack
- **THEN** the engine emits an unknown-command no-op rather than resolving content it does not have

#### Scenario: A successful ranged hit advances monsters

- **WHEN** a ranged attack resolves a hit while the run is in progress and monsters are alive
- **THEN** after the command's own events each living monster acts once, and the interleaving is identical when replayed from the same seed

#### Scenario: Ranged command and events are plain and loggable

- **WHEN** a ranged attack result is serialized and parsed back
- **THEN** the command, the emitted events, and the resulting state round-trip without loss
