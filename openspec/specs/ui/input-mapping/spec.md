# ui/input-mapping Specification

## Purpose
Translates user input from on-screen controls and (on the web) the keyboard into engine commands, without ever mutating game state directly.

## Requirements

### Requirement: Directional controls emit move commands

The on-screen directional control SHALL present four movement directions in a spatial cross layout (a plus-shaped D-pad with up/left/right/down arranged around a center), so the relation between the control and the map is intuitive, and SHALL emit a move command for the selected cardinal direction: north, south, east, or west. Moving into a living occupant remains the melee attack (bump-to-attack); the input layer SHALL NOT provide separate directional attack controls.

#### Scenario: A direction is pressed

- **WHEN** the user presses one of the four directional controls
- **THEN** a move command for that direction is dispatched

#### Scenario: Every cardinal direction is reachable

- **WHEN** the directional control is rendered
- **THEN** all four cardinal directions can be selected and are laid out in a spatial cross rather than a flat row

#### Scenario: There are no directional attack controls

- **WHEN** the on-screen controls are rendered
- **THEN** no directional attack control group is present, and melee remains available through bump-to-attack

### Requirement: A descend control emits a descend command

The on-screen descend control SHALL emit a descend command that advances the player to the next dungeon level, and SHALL be available in play alongside the new combat, pickup, and use-item controls.

#### Scenario: Descend is pressed

- **WHEN** the user presses the descend control while the player is on the stairs
- **THEN** a descend command is dispatched and the player moves to the next level

#### Scenario: Descend off the stairs does not crash

- **WHEN** the user presses the descend control while the player is not on the stairs
- **THEN** a descend command is dispatched and the engine resolves it as a no-op without crashing

### Requirement: Keyboard input is a web-only convenience

Keyboard controls SHALL map the arrow keys to the corresponding move commands, SHALL provide a key that toggles ranged target mode, SHALL map activation keys to descend and to the existing gameplay actions, and SHALL be active only on the web platform. The keyboard mapping SHALL NOT include a directional attack — that mapping is removed along with the on-screen directional attack controls, and the arrows move only.

#### Scenario: Arrow key moves on the web

- **WHEN** the app runs on the web and the user presses an arrow key
- **THEN** a move command for the matching direction is dispatched

#### Scenario: A ranged key toggles target mode on the web

- **WHEN** the app runs on the web, a ranged weapon is carried, and the user presses the ranged target key
- **THEN** the client toggles ranged target mode without dispatching a state-mutating command

#### Scenario: Activation keys dispatch gameplay commands on the web

- **WHEN** the app runs on the web and the user presses a mapped key — an arrow key to move, `p`/`g` to pick up, Enter/`>` to descend, or `f` to toggle ranged target mode
- **THEN** the corresponding move/pickup/descend command is dispatched through the same command path (`f` toggles target mode without dispatching)

#### Scenario: Keyboard does not interfere on native

- **WHEN** the app runs on a native platform
- **THEN** no keyboard-driven commands are dispatched

### Requirement: Input dispatches commands without mutating state

Input handling SHALL advance the game only by dispatching a command to the state owner, and SHALL NOT mutate the game state directly.

#### Scenario: Input goes through dispatch

- **WHEN** any control or keyboard input is received
- **THEN** the game state changes only as a result of the dispatched command being resolved by the engine

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

### Requirement: On-screen controls cover pickup, use-item, and ranged attack

The input layer SHALL provide on-screen controls that emit the pickup and use-item commands, in addition to movement and descend, so every core gameplay action is reachable without a keyboard. When the player carries a ranged weapon it SHALL additionally present a ranged-attack control that is hidden otherwise; pressing it SHALL enter a target mode in which tapping a monster on the map fires a ranged attack at that monster's position. The ranged control SHALL be visible only while a ranged weapon is available (carried), so it does not clutter the controls when unusable.

#### Scenario: A pickup control emits a pickup command

- **WHEN** the user presses the pickup control
- **THEN** a pickup command is dispatched

#### Scenario: A use-item control emits a use-item command naming a carried item

- **WHEN** the user chooses a carried item to use
- **THEN** a use-item command naming that item id is dispatched

#### Scenario: The ranged control appears only with a ranged weapon

- **WHEN** the player carries an item declaring a ranged descriptor
- **THEN** the ranged-attack control is rendered, and when no such item is carried it is not rendered

#### Scenario: The ranged control enters target mode and fires at a tapped monster

- **WHEN** the user presses the ranged control and then taps a visible monster on the map
- **THEN** a ranged-attack command targeting that monster's position is dispatched through the same command path

#### Scenario: Target mode can be dismissed without firing

- **WHEN** the user is in ranged target mode and presses the ranged control again (or taps a non-target tile)
- **THEN** target mode ends and no ranged-attack command is dispatched

### Requirement: Tapping the map dispatches movement or a target

The map SHALL accept taps: in normal play a tap on a cardinal-adjacent tile SHALL dispatch a move in that direction (which bumps-and-attacks when the tile holds a living occupant), and in ranged target mode a tap on a visible monster SHALL dispatch a ranged attack at that monster's position. A tap that selects no valid tile SHALL dispatch nothing.

#### Scenario: Adjacent tap moves

- **WHEN** the user taps a tile orthogonally adjacent to the player
- **THEN** a move command in that direction is dispatched

#### Scenario: Adjacent tap onto a monster bumps

- **WHEN** the user taps a tile adjacent to the player that holds a living monster
- **THEN** a move command is dispatched and the engine resolves it as a bump-to-attack

#### Scenario: Tap fires in target mode

- **WHEN** ranged target mode is active and the user taps a visible monster within range
- **THEN** a ranged-attack command targeting that position is dispatched

#### Scenario: A non-targeting tap does nothing

- **WHEN** the user taps a non-adjacent tile in normal mode or a non-monster tile in target mode
- **THEN** no command is dispatched

### Requirement: Inapplicable pickup and descend controls are hidden

The input layer SHALL render the pickup control only while a floor item occupies the player's tile and the descend control only while the player stands on the level's stairs tile, hiding each otherwise so the action bar never offers an action the engine would refuse. The conditions for the other controls SHALL remain unchanged — for example, the ranged-attack control SHALL still be visible only while a ranged weapon is carried.

#### Scenario: Pickup is hidden on an empty tile

- **WHEN** the player does not stand on a floor item
- **THEN** no pickup control is rendered

#### Scenario: Pickup appears on a floor item

- **WHEN** a floor item occupies the player's tile
- **THEN** the pickup control is rendered and pressing it dispatches a pickup command

#### Scenario: Descend is hidden off the stairs

- **WHEN** the player does not stand on the stairs tile
- **THEN** no descend control is rendered

#### Scenario: Descend appears on the stairs

- **WHEN** the player stands on the stairs tile
- **THEN** the descend control is rendered and pressing it dispatches a descend command

#### Scenario: Other control conditions are unchanged

- **WHEN** the player carries a ranged weapon
- **THEN** the ranged-attack control is rendered as before, independently of the pickup and descend conditions

### Requirement: A wait control passes a turn

The input layer SHALL provide a wait control in the center cell of the directional cross (the middle row between west and east) that emits a `{ type: 'wait' }` command, and SHALL bind the web keyboard's `.` key to the same wait command, so a turn can be passed from the on-screen controls and, on the web, from the keyboard. The wait control SHALL dispatch through the same command path as every other control and SHALL NOT mutate game state directly.

#### Scenario: The center cell waits

- **WHEN** the user presses the center cell of the directional control
- **THEN** a wait command is dispatched

#### Scenario: The web wait key waits

- **WHEN** the app runs on the web and the user presses the `.` key
- **THEN** a wait command is dispatched through the same command path

#### Scenario: The wait control does not mutate state

- **WHEN** the wait control or the `.` key is used
- **THEN** the game state changes only as a result of the dispatched wait command being resolved by the engine
