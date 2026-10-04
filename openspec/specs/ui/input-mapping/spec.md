# ui/input-mapping Specification

## Purpose
Translates user input from on-screen controls and (on the web) the keyboard into engine commands, without ever mutating game state directly.

## Requirements

### Requirement: Directional controls emit move commands

The on-screen directional control SHALL emit a move command for the selected cardinal direction: north, south, east, or west.

#### Scenario: A direction is pressed

- **WHEN** the user presses one of the four directional controls
- **THEN** a move command for that direction is dispatched

#### Scenario: Every cardinal direction is reachable

- **WHEN** the directional control is rendered
- **THEN** all four cardinal directions can be selected

### Requirement: A descend control emits a descend command

The on-screen descend control SHALL emit a descend command that advances the player to the next dungeon level.

#### Scenario: Descend is pressed

- **WHEN** the user presses the descend control
- **THEN** a descend command is dispatched and the player moves to the next level

### Requirement: Keyboard input is a web-only convenience

Keyboard controls SHALL map the arrow keys to the corresponding move commands and an activation key to descend, and SHALL be active only on the web platform.

#### Scenario: Arrow key moves on the web

- **WHEN** the app runs on the web and the user presses an arrow key
- **THEN** a move command for the matching direction is dispatched

#### Scenario: Keyboard does not interfere on native

- **WHEN** the app runs on a native platform
- **THEN** no keyboard-driven commands are dispatched

### Requirement: Input dispatches commands without mutating state

Input handling SHALL advance the game only by dispatching a command to the state owner, and SHALL NOT mutate the game state directly.

#### Scenario: Input goes through dispatch

- **WHEN** any control or keyboard input is received
- **THEN** the game state changes only as a result of the dispatched command being resolved by the engine
