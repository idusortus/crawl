# Spec Delta

## MODIFIED Requirements

### Requirement: A descend control emits a descend command

The on-screen descend control SHALL emit a descend command that advances the player to the next dungeon level, and SHALL be available in play alongside the new combat, pickup, and use-item controls.

#### Scenario: Descend is pressed

- **WHEN** the user presses the descend control while the player is on the stairs
- **THEN** a descend command is dispatched and the player moves to the next level

#### Scenario: Descend off the stairs does not crash

- **WHEN** the user presses the descend control while the player is not on the stairs
- **THEN** a descend command is dispatched and the engine resolves it as a no-op without crashing

### Requirement: Keyboard input is a web-only convenience

Keyboard controls SHALL map the arrow keys to the corresponding move commands and activation keys to descend and to the new gameplay actions, and SHALL be active only on the web platform.

#### Scenario: Arrow key moves on the web

- **WHEN** the app runs on the web and the user presses an arrow key
- **THEN** a move command for the matching direction is dispatched

#### Scenario: Activation keys dispatch gameplay commands on the web

- **WHEN** the app runs on the web and the user presses an attack/pickup/use key
- **THEN** the corresponding command is dispatched through the same command path

#### Scenario: Keyboard does not interfere on native

- **WHEN** the app runs on a native platform
- **THEN** no keyboard-driven commands are dispatched

## ADDED Requirements

### Requirement: Controls exist for the core gameplay actions

The input layer SHALL provide on-screen controls that emit the attack, pickup, and use-item commands, in addition to movement and descend, so every core gameplay action is reachable without a keyboard.

#### Scenario: An attack control emits an attack command

- **WHEN** the user presses the attack control in a chosen direction
- **THEN** an attack command for that direction is dispatched

#### Scenario: A pickup control emits a pickup command

- **WHEN** the user presses the pickup control
- **THEN** a pickup command is dispatched

#### Scenario: A use-item control emits a use-item command naming a carried item

- **WHEN** the user chooses a carried item to use
- **THEN** a use-item command naming that item id is dispatched

### Requirement: Save and resume controls emit save/resume actions

The input layer SHALL provide a control to save the current run and a control to resume a saved run, so persistence is reachable in play.

#### Scenario: A save control saves the run

- **WHEN** the user presses the save control
- **THEN** the current run is saved through the client's save path

#### Scenario: A resume control resumes a saved run

- **WHEN** the user presses the resume control and a save exists
- **THEN** the saved run is resumed and becomes the current game state

### Requirement: Every input dispatches a command or a defined action without mutating state

Input handling SHALL advance the game only by dispatching a command to the state owner (or invoking a defined save/resume action), and SHALL NOT mutate game state directly.

#### Scenario: Input goes through dispatch

- **WHEN** any control or keyboard input is received
- **THEN** the game state changes only as a result of the dispatched command being resolved by the engine, or of a defined save/resume action
