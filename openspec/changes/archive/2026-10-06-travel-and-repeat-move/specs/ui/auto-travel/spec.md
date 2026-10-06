# Spec Delta

## Purpose

Plans and executes multi-step auto-travel toward an explored destination by dispatching ordinary move commands, stopping deterministically whenever the path is interrupted or danger appears.

## ADDED Requirements

### Requirement: Travel plans a deterministic path over explored, passable, unoccupied tiles

The client SHALL plan auto-travel as a path from the player's current tile to the chosen destination over tiles that are explored, passable, and free of any living entity, and SHALL NOT route the path through an unexplored tile, a non-passable tile, or a tile occupied by a living entity. When no such path exists, travel SHALL NOT begin. Path planning SHALL be a deterministic function of the level, the explored mask, the entity positions, the player's tile, and the destination, so the same inputs always yield the same ordered steps.

#### Scenario: A path is planned over explored passable tiles

- **WHEN** the destination is explored and a route of explored, passable, unoccupied tiles connects the player to it
- **THEN** travel plans that route as an ordered sequence of single-tile steps

#### Scenario: Unexplored tiles are not routed through

- **WHEN** the only route to the destination passes through a tile that has not been explored
- **THEN** no path is planned and travel does not begin

#### Scenario: Non-passable tiles are not routed through

- **WHEN** the only route to the destination passes through a non-passable tile
- **THEN** no path is planned and travel does not begin

#### Scenario: Living occupants are not routed through

- **WHEN** the only route to the destination passes through a tile occupied by a living entity
- **THEN** no path is planned and travel does not begin

#### Scenario: Planning is deterministic

- **WHEN** the same level, explored mask, entities, player tile, and destination are planned more than once
- **THEN** the same ordered sequence of steps results every time

### Requirement: Travel advances one move command per step

Auto-travel SHALL advance the player one tile per step by dispatching an ordinary `move` command for that step's direction through the same single command path as manual input, so every step is a normal logged turn on which monsters act. Travel SHALL NOT mutate game state directly and SHALL NOT collapse multiple steps into a single command.

#### Scenario: One move command is dispatched per step

- **WHEN** travel advances one tile along its planned route
- **THEN** exactly one move command for that step's direction is dispatched through the shared command path

#### Scenario: Each step is a normal logged turn

- **WHEN** travel performs a step
- **THEN** the step is recorded in the command log as an ordinary move and monsters act once, exactly as for a manual move

#### Scenario: Travel is replayable

- **WHEN** the same seed and the same sequence of travel steps and interruptions are applied again
- **THEN** the resulting game state is identical

### Requirement: Travel stops when the destination is reached or the path is interrupted

Auto-travel SHALL stop when the player reaches the destination tile, when the next step is blocked or the path is interrupted, when the next step would arrive on the stairs tile, or when the level changes. A stopped travel SHALL dispatch no further move commands.

#### Scenario: The destination is reached

- **WHEN** the player's tile becomes the travel destination
- **THEN** travel stops and no further move command is dispatched

#### Scenario: A blocked step stops travel

- **WHEN** the next travel step is refused by the engine (a `blocked` event / the player's tile does not change)
- **THEN** travel stops immediately and no further move command is dispatched

#### Scenario: An interrupted path stops travel

- **WHEN** the planned route can no longer be followed (for example a tile that was passable is no longer free)
- **THEN** travel stops rather than dispatching a step that leaves the planned route

#### Scenario: Travel stops before the stairs

- **WHEN** the next travel step would arrive on the level's stairs tile
- **THEN** travel stops without dispatching that step, leaving the descend decision to the player

#### Scenario: A level change stops travel

- **WHEN** the level changes (for example the player descends) while travel is active
- **THEN** travel stops

### Requirement: Travel stops when danger appears

Auto-travel SHALL stop when, after a step, a living monster becomes visible to the player, when the player is attacked or takes damage, or when a living monster becomes orthogonally adjacent to the player. A stopped travel SHALL dispatch no further move commands.

#### Scenario: A visible living monster stops travel

- **WHEN** a step brings a living monster into the player's field of view
- **THEN** travel stops

#### Scenario: Being attacked stops travel

- **WHEN** the player is attacked or takes damage during a travel step
- **THEN** travel stops

#### Scenario: An adjacent living monster stops travel

- **WHEN** a living monster becomes orthogonally adjacent to the player
- **THEN** travel stops

### Requirement: Travel state is ephemeral and never enters game state

Travel-target mode, the chosen destination, and the in-progress travel SHALL be presentation-only client state that never enters `GameState`, the command log, or the serialized save; saving or resuming a run SHALL be unaffected by an active travel, and a resumed run SHALL begin with no travel in progress.

#### Scenario: Travel does not appear in serialized state

- **WHEN** a run with an active travel is serialized
- **THEN** the serialized state contains no travel-mode or travel-destination fields

#### Scenario: A resumed run has no travel in progress

- **WHEN** a saved run is resumed
- **THEN** no travel is active and no travel state is restored
