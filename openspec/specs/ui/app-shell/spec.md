# ui/app-shell Specification

## Purpose
The Expo Router application shell that owns the client-side game state and dispatches engine commands, keeping the UI a pure client of the `@engine` public surface.

## Requirements

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

### Requirement: The UI is a pure client of the engine public surface

The UI code SHALL import engine functionality only from the engine public entry point and SHALL NOT reach into deeper engine modules or embed engine behavior of its own.

#### Scenario: No deep engine imports

- **WHEN** the UI is compiled and linted
- **THEN** no UI module imports a path deeper than the engine public entry point

#### Scenario: Engine remains untouched

- **WHEN** this capability is implemented
- **THEN** no file under the engine source tree is modified

### Requirement: The client saves and resumes a run

The client SHALL be able to save the current run as its full JSON state plus its full command log and `appliedCount` cursor, and to resume a saved run by deserializing that state and replaying only the remaining commands (the log tail past `appliedCount`) from there, so a session can be interrupted and continued. The save SHALL be persisted to device storage so it survives an application restart, rather than living only in memory for the life of the process. Persistence SHALL go through the engine's serialization/replay surface; the client SHALL NOT implement engine behavior of its own.

#### Scenario: Saving captures the run

- **WHEN** the user saves the current run
- **THEN** the client persists the run's full JSON state, full command log, and `appliedCount` cursor through the client-side save path

#### Scenario: Resuming restores the run

- **WHEN** the user resumes a saved run
- **THEN** the client rebuilds the run (by deserializing the saved state and replaying the remaining commands past `appliedCount`) and presents the resumed state

#### Scenario: Saving never leaves the engine boundary

- **WHEN** the client saves or resumes
- **THEN** all state serialization/replay goes through the `@engine` public surface and the client does not implement engine behavior of its own

#### Scenario: A save survives an application restart

- **WHEN** the user saves a run, closes the application, and launches it again
- **THEN** the saved run is still available to resume

### Requirement: Auto-save preserves the run without user action

The client SHALL auto-save the run so that an interruption does not silently lose progress, without mutating the live game state during the save. The auto-saved run SHALL be written to device storage so it survives an application restart.

#### Scenario: Progress is auto-saved

- **WHEN** the run advances
- **THEN** the client persists the run through its save path without requiring an explicit save press

#### Scenario: Auto-save does not disturb play

- **WHEN** an auto-save occurs
- **THEN** the live game state is unchanged and continues to accept commands identically

#### Scenario: Auto-save survives an application restart

- **WHEN** a run has advanced and the application is relaunched
- **THEN** the auto-saved run is available to resume

### Requirement: A new run is available after game over

The client SHALL allow starting a fresh run (for example after game over) with a new seed, presenting the ordinary play view for the new run.

#### Scenario: Starting over begins a new run

- **WHEN** the user starts a new run
- **THEN** the client builds initial state for the new seed and presents the play view

#### Scenario: A new run clears the game-over surface

- **WHEN** a new run starts after game over
- **THEN** the renderer shows the ordinary play view rather than the game-over surface

### Requirement: The client's initial state is pack-agnostic

The client SHALL build the player from content supplied by the loaded pack rather than embedding a class id, so that swapping the loaded pack is the only change needed to play a different theme and no pack whose classes differ from the fantasy pack's is unreachable.

#### Scenario: Swapping the pack changes the playable class

- **WHEN** the client is pointed at a different valid pack
- **THEN** the player is built from that pack's own class and the run is playable, with no client code specific to the original pack's class id

### Requirement: A stored save is adopted on startup without blocking first paint

On startup the client SHALL load any previously stored save and make it available to resume, without blocking the first render of the game screen. The client SHALL present the ordinary fresh run and then, if a stored save exists, make the resume affordance available; the client SHALL NOT silently replace the live run with the stored save. The client SHALL evaluate `hasSave` as `saveStore !== undefined` **after hydration settles**, and SHALL prevent a save or auto-save that occurs before hydration settles from overwriting the stored save (a hydration barrier), and SHALL NOT let hydration overwrite a slot already written earlier in the session.

#### Scenario: Startup is not blocked by loading a save

- **WHEN** the application starts
- **THEN** the game screen renders without waiting for the stored save to load

#### Scenario: A stored save becomes resumable

- **WHEN** a stored save exists and the application has started
- **THEN** the resume affordance is available and resuming presents the stored run

#### Scenario: A stored save does not silently replace the live run

- **WHEN** the application starts and a stored save exists
- **THEN** the client continues to present the fresh run until the user explicitly resumes the stored save

#### Scenario: A pre-hydration write cannot clobber the stored save

- **WHEN** the user acts (triggering a save or auto-save) before hydration has settled
- **THEN** the save/auto-save is a no-op and the stored save is not overwritten, and hydration does not overwrite a slot written earlier in the session

### Requirement: Save feedback and storage errors are surfaced

The client SHALL make the outcome of a save observable to the user: a successful save SHALL produce a visible, transient indication, and a storage failure SHALL be surfaced to the user rather than swallowed. A storage or hydration failure SHALL be surfaced through a separate, non-fatal `saveError` channel (for example an inline note on the `ActionBar`) and SHALL NOT be routed to the fatal pack-load error that replaces the game screen.

#### Scenario: A successful save is acknowledged

- **WHEN** the user saves the current run and the write succeeds
- **THEN** the client shows a visible indication that the run was saved, which clears on its own

#### Scenario: A save control always produces feedback

- **WHEN** the user presses the save control
- **THEN** the client shows a visible save outcome (a saved indication or a surfaced error) whether or not an auto-saved run already exists

#### Scenario: A storage failure is surfaced without hiding the game

- **WHEN** reading or writing the stored save fails
- **THEN** the client surfaces the failure through the non-fatal `saveError` channel (e.g. an `ActionBar` inline note) while continuing to render and play the current run, rather than routing the failure to the fatal pack-load error

### Requirement: The save and resume controls keep a synchronous interface

The client's public save and resume controls SHALL remain synchronous `() => void` handlers, with any asynchronous storage work performed internally, so dependent UI (keyboard handlers, the action bar, and provider types) does not drift to promise-returning handlers.

#### Scenario: Pressing save or resume returns immediately

- **WHEN** the save or resume control is invoked
- **THEN** the handler returns without awaiting a promise (storage I/O happens internally) and the surrounding UI type signature is unchanged

### Requirement: Persistence introduces no ambient nondeterminism

The client's persistence layer SHALL NOT introduce ambient randomness or wall-clock time, so a resumed run is identical to the uninterrupted run.

#### Scenario: A resumed run equals an uninterrupted run

- **WHEN** a run is interrupted (through save) and resumed
- **THEN** continued play matches the same run played without interruption

#### Scenario: No ambient randomness or time in persistence

- **WHEN** the persistence path is inspected
- **THEN** it uses neither a random-number source nor wall-clock time to decide stored content

### Requirement: Each run starts from a fresh seed

The client SHALL start each run from a fresh seed derived at the client boundary (which may use wall-clock time or a random source), so the first launch of the application and every subsequent "new run" produce a different level rather than replaying the same hard-coded seed. The seed SHALL be passed into the engine's initial-state factory; the engine SHALL remain free of wall-clock time and ambient randomness. An explicit seed supplied by a caller SHALL still be honored so tests and stories can pin a run.

#### Scenario: A cold start uses a fresh seed

- **WHEN** the application launches without an explicit seed
- **THEN** the initial run is built from a fresh seed and its level need not match a previous launch

#### Scenario: Repeated new runs differ

- **WHEN** the user starts a new run more than once
- **THEN** each run is built from a different fresh seed so the generated levels differ

#### Scenario: An explicit seed is honored

- **WHEN** a caller supplies an explicit seed
- **THEN** the initial state is built from that seed exactly as before, so deterministic tests and replays are unaffected

#### Scenario: Seed acquisition stays outside the engine

- **WHEN** the client obtains the fresh seed
- **THEN** no file under the engine source tree consults wall-clock time or ambient randomness to produce it

### Requirement: The play surface respects safe-area insets

The client SHALL apply the device's safe-area insets to the game surfaces so the OS status bar and navigation bar do not overlay the map, HUD, controls, or terminal screen. The play view (including its error surface) and the game-over view SHALL each be inset at the top and bottom by the corresponding safe-area insets.

#### Scenario: The top of the play view is not overlaid

- **WHEN** the game screen renders on a device with a status bar or notch
- **THEN** the HUD and map begin below the top safe-area inset

#### Scenario: The bottom of the play view is not overlaid

- **WHEN** the game screen renders on a device with a navigation bar or home indicator
- **THEN** the controls end above the bottom safe-area inset

#### Scenario: The game-over surface is also inset

- **WHEN** the game-over surface renders
- **THEN** its content is kept clear of the top and bottom safe-area insets
