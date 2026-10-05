# Spec Delta

## ADDED Requirements

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
