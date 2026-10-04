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
