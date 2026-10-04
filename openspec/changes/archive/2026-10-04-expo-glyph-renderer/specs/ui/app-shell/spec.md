# Spec Delta

## Purpose

The Expo Router application shell that owns the client-side game state and dispatches engine commands, keeping the UI a pure client of the `@engine` public surface.

## ADDED Requirements

### Requirement: App launches into the game screen

The application SHALL register a single root game screen through Expo Router so that launching the app presents the playable dungeon view.

#### Scenario: Cold start reaches the game screen

- **WHEN** the application starts
- **THEN** the router mounts the game screen and the dungeon map is displayed

#### Scenario: No placeholder entry point remains

- **WHEN** the application is started
- **THEN** the app is launched through the Expo Router entry point rather than a manually registered root component

### Requirement: Startup loads the content pack with a typed-error fallback

On startup the client SHALL load the fantasy content pack through the engine loader and, when loading fails with a typed engine error, SHALL present a recoverable error surface instead of crashing.

#### Scenario: A valid pack loads

- **WHEN** the bundled fantasy pack is valid and meets the composition floor
- **THEN** the loaded pack is available to the game screen and the first level is generated

#### Scenario: A failing pack is reported, not fatal

- **WHEN** the bundled pack fails to load with a typed load error
- **THEN** the client shows an error message and does not crash

### Requirement: The client owns game state and dispatches commands immutably

The client SHALL hold the current `GameState` and the `LoadedPack`, and SHALL advance the game only by resolving a command through the pack-aware engine entry point with an RNG derived from the current state, replacing state with the returned value. The client SHALL NOT mutate the input state.

#### Scenario: A command produces a new state value

- **WHEN** a command is dispatched
- **THEN** the client replaces its held state with the state returned by the engine and the previous state value is unchanged

#### Scenario: Dispatching does not mutate the previous state object

- **WHEN** a command is dispatched
- **THEN** the state object held before the dispatch is not mutated (its fields are unchanged after the dispatch returns)

#### Scenario: The RNG travels with state

- **WHEN** a command that consumes randomness is dispatched
- **THEN** the RNG is derived from the current state's serialized RNG fields before resolution

### Requirement: The UI is a pure client of the engine public surface

The UI code SHALL import engine functionality only from the engine public entry point and SHALL NOT reach into deeper engine modules or embed engine behavior of its own.

#### Scenario: No deep engine imports

- **WHEN** the UI is compiled and linted
- **THEN** no UI module imports a path deeper than the engine public entry point

#### Scenario: Engine remains untouched

- **WHEN** this capability is implemented
- **THEN** no file under the engine source tree is modified
