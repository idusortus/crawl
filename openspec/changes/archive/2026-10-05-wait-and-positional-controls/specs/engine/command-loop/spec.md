# Spec Delta

## ADDED Requirements

### Requirement: Wait command

The engine SHALL accept a parameterless `wait` command that passes a turn without moving the player, emitting an observable event and advancing monsters exactly once under the same per-turn rule as other world-changing commands. The command SHALL be plain serializable data and content-free, so it resolves through both the content-free and the pack-aware entry points and a pack-free replay of a remainder containing it is unaffected. A malformed wait — any key beyond `type` — SHALL degrade to `noop('malformed-command')` without advancing, a wait applied to a state whose player entity is absent SHALL degrade to `noop('no-player-entity')`, and a wait applied to a run that has ended SHALL degrade to `noop('run-over')` without advancing the world.

#### Scenario: Waiting passes the turn and the player stays put

- **WHEN** a well-formed wait is applied while the run is in progress
- **THEN** the returned state places the player on the same tile, at least one event is emitted, and the input state is unchanged

#### Scenario: Waiting advances monsters exactly once

- **WHEN** a wait is applied while the run is in progress and monsters are alive
- **THEN** after the wait's own event each living monster acts once, and the interleaving of player and monster events is identical when replayed from the same seed

#### Scenario: Wait is content-free and resolves through both entry points

- **WHEN** a well-formed wait is applied through the content-free entry point and through the pack-aware entry point
- **THEN** both return new state and at least one event under the same contract, and the content-free result matches the pack-aware result

#### Scenario: A malformed wait is a no-op and does not advance

- **WHEN** a wait carries any key beyond `type`
- **THEN** the engine emits `noop('malformed-command')`, returns state equivalent to the input, and no monster acts

#### Scenario: A wait with no player entity is a no-op

- **WHEN** a wait is applied to a state whose player entity is absent
- **THEN** the engine emits `noop('no-player-entity')` and no monster acts

#### Scenario: A wait after the run ends is inert

- **WHEN** a wait is applied to a state whose run has ended
- **THEN** the engine emits `noop('run-over')` and does not advance the world

#### Scenario: Wait and its event are plain and loggable

- **WHEN** a wait result is serialized and parsed back
- **THEN** the command, the emitted `waited` event, and the resulting state round-trip without loss
