# Spec Delta

## MODIFIED Requirements

### Requirement: The client owns game state and dispatches commands immutably

The client SHALL hold the current `GameState` and the `LoadedPack`, and SHALL advance the game only by resolving a command through the pack-aware engine entry point with an RNG derived from the current state, replacing state with the returned value. The client SHALL NOT mutate the input state. The client SHALL also own the save/resume flow and the terminal (game-over) presentation. When the client builds the initial state it SHALL source the player's class from the loaded pack itself, defaulting to that pack's first declared class, so that any schema-valid pack can start a run without a pack-specific player-class literal in the client.

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

#### Scenario: The player is built from the loaded pack's own class

- **WHEN** the client builds initial state from a loaded pack, with no player-class id supplied
- **THEN** the player entity's kind is the first class the pack declares, and the player's starting HP and attack come from that same class

#### Scenario: Any schema-valid pack starts a run

- **WHEN** the client builds initial state from a loaded pack that declares classes other than the fantasy pack's (for example a family-dog pack declaring `good-boy`/`chonker`)
- **THEN** initial state is produced without error and the player's kind is one of that pack's class ids

#### Scenario: An explicit player class is honored

- **WHEN** a caller builds initial state naming a class the loaded pack declares
- **THEN** the player is built from that class, and naming a class the pack does not declare fails with the engine's unknown-content-id error

## ADDED Requirements

### Requirement: The client's initial state is pack-agnostic

The client SHALL build the player from content supplied by the loaded pack rather than embedding a class id, so that swapping the loaded pack is the only change needed to play a different theme and no pack whose classes differ from the fantasy pack's is unreachable.

#### Scenario: Swapping the pack changes the playable class

- **WHEN** the client is pointed at a different valid pack
- **THEN** the player is built from that pack's own class and the run is playable, with no client code specific to the original pack's class id
