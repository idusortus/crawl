# Spec Delta

## MODIFIED Requirements

### Requirement: The client owns game state and dispatches commands immutably

The client SHALL hold the current `GameState` and the `LoadedPack`, and SHALL advance the game only by resolving a command through the pack-aware engine entry point with an RNG derived from the current state, replacing state with the returned value. The client SHALL NOT mutate the input state. The client SHALL also own the save/resume flow and the terminal (game-over) presentation.

#### Scenario: A command produces a new state value

- **WHEN** a command is dispatched
- **THEN** the client replaces its held state with the state returned by the engine and the previous state value is unchanged

#### Scenario: Dispatching does not mutate the previous state object

- **WHEN** a command is dispatched
- **THEN** the state object held before the dispatch is not mutated (its fields are unchanged after the dispatch returns)

#### Scenario: The RNG travels with state

- **WHEN** a command that consumes randomness is dispatched
- **THEN** the RNG is derived from the current state's serialized RNG fields before resolution

#### Scenario: The terminal state is honored

- **WHEN** the state returned by the engine marks the run as ended
- **THEN** the client stops dispatching monster-advancing gameplay commands and presents the game-over surface

## ADDED Requirements

### Requirement: The client saves and resumes a run

The client SHALL be able to save the current run as JSON state plus a command log, and to resume a saved run by replaying it from its seed, so a session can be interrupted and continued.

#### Scenario: Saving captures the run

- **WHEN** the user saves the current run
- **THEN** the client persists the run's JSON state and command log through the client-side save path

#### Scenario: Resuming restores the run

- **WHEN** the user resumes a saved run
- **THEN** the client rebuilds the run (by replaying the command log from the seed) and presents the resumed state

#### Scenario: Saving never leaves the engine boundary

- **WHEN** the client saves or resumes
- **THEN** all state serialization/replay goes through the `@engine` public surface and the client does not implement engine behavior of its own

### Requirement: Auto-save preserves the run without user action

The client SHALL auto-save the run so that an interruption does not silently lose progress, without mutating the live game state during the save.

#### Scenario: Progress is auto-saved

- **WHEN** the run advances
- **THEN** the client persists the run through its save path without requiring an explicit save press

#### Scenario: Auto-save does not disturb play

- **WHEN** an auto-save occurs
- **THEN** the live game state is unchanged and continues to accept commands identically

### Requirement: A new run is available after game over

The client SHALL allow starting a fresh run (for example after game over) with a new seed, presenting the ordinary play view for the new run.

#### Scenario: Starting over begins a new run

- **WHEN** the user starts a new run
- **THEN** the client builds initial state for the new seed and presents the play view

#### Scenario: A new run clears the game-over surface

- **WHEN** a new run starts after game over
- **THEN** the renderer shows the ordinary play view rather than the game-over surface
