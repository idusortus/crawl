# Spec Delta

## ADDED Requirements

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
