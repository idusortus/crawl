# engine/command-loop Specification

## Purpose
Defines the single entry point through which the game advances: a caller submits a command, receives new immutable state and a description of what happened, and never mutates state directly.

## Requirements

### Requirement: Command-in, event-out contract

The engine SHALL expose a single operation that accepts the current state, a command, and the injected random source, and returns the resulting state together with the events that occurred, without mutating the input state.

#### Scenario: Applying a command returns new state and events

- **WHEN** a valid command is applied to a state
- **THEN** the engine returns a new state object and a list of events describing the effects, and the original state object is unchanged

#### Scenario: Callers never mutate state directly

- **WHEN** a consumer holds a returned state object
- **THEN** the only supported way to change it is to apply another command, and no consumer-facing API mutates state in place

### Requirement: Commands are plain serializable data

A command SHALL be a plain data value identified by a type and its parameters, so that a full session can be recorded as a JSON-serializable command log.

#### Scenario: Command log replays a session

- **WHEN** the command log of a session is replayed from the original seed
- **THEN** the resulting state and emitted events match the original session

#### Scenario: Unknown command is rejected without corruption

- **WHEN** a command with an unrecognized type is applied
- **THEN** the engine reports the command as invalid and returns state that is equivalent to the input state

### Requirement: Events describe observable outcomes

Every command application SHALL emit at least one event that classifies the observable outcome, and the events SHALL be plain serializable data.

#### Scenario: Every command yields at least one event

- **WHEN** any command, including one with no effect, is applied
- **THEN** at least one event is returned describing the outcome

#### Scenario: Ineffective command yields a no-op event

- **WHEN** a command cannot produce any effect
- **THEN** the engine emits a no-op event rather than silently returning an empty event list

### Requirement: JSON-serializable state

Game state SHALL contain only plain data — no class instances, functions, or non-JSON collections — so that serializing and deserializing state round-trips without loss.

#### Scenario: State round-trips through serialization

- **WHEN** game state is converted to JSON and parsed back
- **THEN** the parsed state is equivalent to the original and behaves identically when further commands are applied

### Requirement: Event log

The engine state SHALL include an append-only, serializable log of emitted events that supports inspecting what has happened during a session.

#### Scenario: Emitted events are recorded in order

- **WHEN** a sequence of commands is applied
- **THEN** the event log contains the emitted events in the order they occurred, and events are never removed or reordered

### Requirement: Command and event unions are extensible

The engine SHALL represent commands and events as discriminated unions that can be extended with new action types without altering the existing command-in/event-out contract, and unknown command types SHALL continue to degrade to a no-op rather than throwing.

#### Scenario: New command type follows the existing contract

- **WHEN** a newly added command type (such as use-item, attack, or a pickup command) is applied
- **THEN** it returns new state and at least one event under the same contract as existing commands, and the input state is unchanged

#### Scenario: Unrecognized command type still degrades gracefully

- **WHEN** a command of an unrecognized type is applied after the union is extended
- **THEN** the engine emits a no-op event and returns state equivalent to the input, without throwing

#### Scenario: New event type is plain and loggable

- **WHEN** a new event type is emitted
- **THEN** it is plain serializable data appended to the event log in order like every other event

### Requirement: Descend command

The engine SHALL accept a descend command that advances the player to a newly generated level at the next depth, placing the player at that level's spawn point and emitting an observable event, while preserving the command-in/event-out contract. Descending SHALL be gated on the player standing on the current level's stairs, and a descend command issued off the stairs SHALL degrade to a no-op rather than advancing the level.

#### Scenario: Descending generates a deeper level

- **WHEN** a descend command is applied while the player stands on the level's stairs
- **THEN** the returned state contains a newly generated level at depth D+1 and the player is placed at its spawn point

#### Scenario: Descending off the stairs is a no-op

- **WHEN** a descend command is applied while the player is not standing on the level's stairs
- **THEN** the engine emits a no-op event, the level is unchanged, and no new level is generated

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

### Requirement: A turn advances monsters after the player acts

When a gameplay command is applied while the run is in progress, the engine SHALL advance monsters exactly once before returning according to an explicit per-outcome rule: a successful `move` (including bump-attack), a successful `attack` hit, a successful `pickup`, and a successful `use-item` advance monsters; a `descend` success advances monsters on the **current** level but the newly generated level's monsters do not act that turn; and a refused `move`/`attack` (no-op, self, empty), an empty `pickup`, a no-op `use-item`, a `descend` off the stairs, a malformed/unknown command, and any command after death SHALL NOT advance monsters. The turn step SHALL re-read the run status and stop advancing the moment the player dies.

#### Scenario: Monsters act after a successful player command

- **WHEN** a gameplay command that changes the world (move, bump-attack, attack hit, pickup, or use-item) is applied and the run is in progress and monsters are alive
- **THEN** after the command's own events, each living monster acts once and any events they produce are appended in order

#### Scenario: No-op and refused commands do not advance monsters

- **WHEN** a command that has no world effect is applied (empty/self/blocked attack, a blocked move, a pickup on an empty tile, a no-op use-item, a malformed or unknown command, or a descend off the stairs)
- **THEN** no monster acts and the event log contains only the command's own no-op/blocked event

#### Scenario: Descent advances the current level only

- **WHEN** a descend command succeeds
- **THEN** the new level's monsters are placed but do NOT act on the same turn as the descent

#### Scenario: The turn step stops when the player dies

- **WHEN** a monster kills the player during a turn step
- **THEN** no further monster acts on that step and the run is terminal

#### Scenario: Turns are deterministic

- **WHEN** the same command sequence is replayed from the same seed
- **THEN** the interleaving of player and monster events is identical

### Requirement: A terminal state ends the run

The engine SHALL represent the run's status in game state such that an in-progress run is distinct from a run that has ended, and once the run has ended the engine SHALL NOT advance the player, spawn, or monsters in response to gameplay commands.

#### Scenario: Run status is part of state

- **WHEN** the player dies
- **THEN** the returned state carries a distinct terminal run status that is plain serializable data

#### Scenario: Gameplay commands are inert after the run ends

- **WHEN** a gameplay command is applied to a state whose run has ended
- **THEN** the engine emits a no-op event and returns state equivalent to the input, without advancing the world

#### Scenario: Terminal state round-trips

- **WHEN** a state whose run has ended is serialized and parsed back
- **THEN** the terminal status round-trips without loss and the state remains inert to further gameplay commands

### Requirement: Item pickup command

The engine SHALL provide a command that picks up an item on the tile the player occupies, so floor items enter the player's carried items, emitting an observable event; picking up on an empty tile SHALL degrade to a no-op.

#### Scenario: Picking up an item on the player's tile

- **WHEN** a pickup command is applied while an item occupies the player's tile
- **THEN** the item is removed from the floor and recorded as carried by the player, and an event describes the pickup

#### Scenario: Picking up on an empty tile is a no-op

- **WHEN** a pickup command is applied while no item occupies the player's tile
- **THEN** the engine emits a no-op event and returns state equivalent to the input

#### Scenario: Pickup is deterministic and serializable

- **WHEN** a pickup command is replayed from the same seed and the resulting state is serialized
- **THEN** the carried items and remaining floor items are identical and round-trip without loss

### Requirement: Reaching a new level repositions the player and repopulates it

When the player descends, the new level SHALL be populated with monsters and items and SHALL place the player at its spawn (distinct from the stairs and from all monsters), and the per-level view state SHALL reset for the new level.

#### Scenario: A descended level is populated and playable

- **WHEN** the player descends onto a new level
- **THEN** the new level has monsters and items placed, the player is on a passable spawn tile distinct from them, and the explored record reflects only the new level

#### Scenario: The new level carries stairs

- **WHEN** a level is generated on descent
- **THEN** it reports a stairs location on a passable tile distinct from the player's spawn
