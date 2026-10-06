# Spec Delta

## MODIFIED Requirements

### Requirement: Directional controls emit move commands

The on-screen directional control SHALL present four movement directions in a spatial cross layout (a plus-shaped D-pad with up/left/right/down arranged around a center), so the relation between the control and the map is intuitive, and SHALL emit a move command for the selected cardinal direction: north, south, east, or west. Moving into a living occupant remains the melee attack (bump-to-attack); the input layer SHALL NOT provide separate directional attack controls. While auto-travel is active, a directional press (the on-screen control or, on the web, an arrow key) SHALL instead cancel travel and SHALL be swallowed without emitting a move command, so the cancelling press costs no turn.

#### Scenario: A direction is pressed

- **WHEN** the user presses one of the four directional controls
- **THEN** a move command for that direction is dispatched

#### Scenario: Every cardinal direction is reachable

- **WHEN** the directional control is rendered
- **THEN** all four cardinal directions can be selected and are laid out in a spatial cross rather than a flat row

#### Scenario: There are no directional attack controls

- **WHEN** the on-screen controls are rendered
- **THEN** no directional attack control group is present, and melee remains available through bump-to-attack

#### Scenario: A direction cancels travel and is swallowed

- **WHEN** auto-travel is active and the user presses a directional control (or, on the web, an arrow key)
- **THEN** travel is cancelled and no move command is dispatched for that press

### Requirement: A wait control passes a turn

The input layer SHALL provide a wait control in the center cell of the directional cross (the middle row between west and east) that emits a `{ type: 'wait' }` command, and SHALL bind the web keyboard's `.` key to the same wait command, so a turn can be passed from the on-screen controls and, on the web, from the keyboard. The wait control SHALL dispatch through the same command path as every other control and SHALL NOT mutate game state directly. While auto-travel is active, pressing the wait control (or the `.` key) SHALL instead cancel travel and SHALL be swallowed without dispatching a wait command, so the cancelling press costs no turn.

#### Scenario: The center cell waits

- **WHEN** the user presses the center cell of the directional control
- **THEN** a wait command is dispatched

#### Scenario: The web wait key waits

- **WHEN** the app runs on the web and the user presses the `.` key
- **THEN** a wait command is dispatched through the same command path

#### Scenario: The wait control does not mutate state

- **WHEN** the wait control or the `.` key is used
- **THEN** the game state changes only as a result of the dispatched wait command being resolved by the engine

#### Scenario: A wait cancels travel and is swallowed

- **WHEN** auto-travel is active and the user presses the wait control (or, on the web, the `.` key)
- **THEN** travel is cancelled and no wait command is dispatched for that press

## ADDED Requirements

### Requirement: Holding a directional control repeats movement at a fixed cadence

The on-screen directional control SHALL repeat the selected direction's move command at a fixed cadence while the control is pressed and held on a touch platform, so the player can cross several tiles without tapping repeatedly. The repeat SHALL stop when the control is released, when a step is blocked (the engine refuses the move / the player's tile does not change), or when the run ends. Each repeated step SHALL dispatch through the same single command path as a single press, so it is a normal logged turn. This behavior SHALL be touch-only: the input layer SHALL NOT add hold-to-repeat behavior to the web keyboard, which continues to repeat only through the operating system.

#### Scenario: Holding a direction repeats movement

- **WHEN** the user presses and holds an on-screen directional control on a touch platform
- **THEN** move commands for that direction are dispatched repeatedly at a fixed cadence

#### Scenario: Releasing stops the repeat

- **WHEN** the user releases a held directional control
- **THEN** no further move commands are dispatched for that hold

#### Scenario: A blocked step stops the repeat

- **WHEN** a repeated step is refused by the engine (a `blocked` event / the player's tile does not change)
- **THEN** the repeat stops immediately rather than continuing to dispatch refused moves

#### Scenario: The end of the run stops the repeat

- **WHEN** the run ends while a directional control is held
- **THEN** the repeat stops

#### Scenario: Each repeated step is a normal logged turn

- **WHEN** a held control repeats a move
- **THEN** the step is recorded in the command log as an ordinary move and monsters act once, exactly as for a single press

#### Scenario: No keyboard hold behavior is added

- **WHEN** the app runs on the web and the user holds an arrow key
- **THEN** movement repeats only through the operating system's key repeat, not through any input-layer hold behavior

### Requirement: A travel control toggles travel-target mode

The input layer SHALL provide a control that toggles travel-target mode, indicating while the mode is active that the next map tap selects a destination. Pressing the control while travel-target mode is active SHALL cancel travel-target mode (and any travel in progress) without dispatching a command. The travel control SHALL dispatch through the same command path as every other control or invoke a defined presentation action, and SHALL NOT mutate game state directly.

#### Scenario: The travel control enters travel-target mode

- **WHEN** the user presses the travel control while travel-target mode is inactive
- **THEN** travel-target mode becomes active without dispatching a state-mutating command

#### Scenario: The travel control cancels travel-target mode

- **WHEN** the user presses the travel control while travel-target mode is active
- **THEN** travel-target mode ends and no command is dispatched

### Requirement: Tapping the map in travel mode selects an explored destination

While travel-target mode is active, a tap on a tile that is already explored, passable, and free of any living entity SHALL set that tile as the travel destination and begin auto-travel through the same single command path. Travel SHALL NOT begin while a living monster is already visible to the player or orthogonally adjacent to the player, even when the tapped tile is otherwise a legal destination. A tap on an unexplored tile, a non-passable tile, a tile occupied by a living entity, or any tile outside the grid SHALL dispatch nothing and SHALL end travel-target mode. Only explored tiles SHALL be targetable. Travel mode is a distinct map-tap mode, alongside the existing normal and ranged-target modes.

#### Scenario: Tapping an explored tile starts travel

- **WHEN** travel-target mode is active and the user taps an explored, passable, unoccupied tile
- **THEN** that tile becomes the travel destination and auto-travel begins through the shared command path

#### Scenario: Travel does not begin while a monster is already visible or adjacent

- **WHEN** travel-target mode is active, a living monster is already visible to the player or orthogonally adjacent to the player, and the user taps an explored, passable, unoccupied tile
- **THEN** auto-travel does not begin and no move command is dispatched

#### Scenario: An unexplored tile is not a destination

- **WHEN** travel-target mode is active and the user taps a tile that has not been explored
- **THEN** no command is dispatched and travel-target mode ends

#### Scenario: A non-passable or occupied tile is not a destination

- **WHEN** travel-target mode is active and the user taps a non-passable tile or a tile occupied by a living entity
- **THEN** no command is dispatched and travel-target mode ends

#### Scenario: Only explored tiles are targetable

- **WHEN** travel-target mode is active
- **THEN** an unexplored tile can never be selected as a destination
