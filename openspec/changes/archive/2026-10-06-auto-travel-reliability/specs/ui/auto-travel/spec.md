# Spec Delta

## MODIFIED Requirements

### Requirement: Travel plans a deterministic path over explored, passable, unoccupied tiles

The client SHALL plan auto-travel from the player's current tile toward the chosen destination over tiles that are explored, passable, and free of any living entity, and SHALL NOT route the path through an unexplored tile, a non-passable tile, or a tile occupied by a living entity. When the chosen destination is itself reachable over such tiles, the path SHALL end on it. When the chosen destination is explored, passable, and unoccupied but is **not** reachable, the client SHALL instead plan a path to the reachable explored, passable, unoccupied tile that best approaches the destination, so travel still begins toward the chosen area, and SHALL NOT route through an unexplored, non-passable, or living-occupied tile while doing so. Travel SHALL NOT begin when no reachable destination tile exists (other than the player's own tile); a living monster orthogonally adjacent to the player is a separate no-start condition specified in the `ui/input-mapping` capability. Path planning SHALL be a deterministic function of the level, the explored mask, the entity positions, the player's tile, and the chosen destination, so the same inputs always yield the same ordered steps.

#### Scenario: A path is planned over explored passable tiles

- **WHEN** the destination is explored and a route of explored, passable, unoccupied tiles connects the player to it
- **THEN** travel plans that route as an ordered sequence of single-tile steps ending on the destination

#### Scenario: An unreachable destination is approached best-effort

- **WHEN** the destination is explored, passable, and unoccupied but no route of explored, passable, unoccupied tiles connects the player to it
- **THEN** travel plans a route over such tiles to the reachable tile that best approaches the destination, and travel begins

#### Scenario: No reachable destination means no path

- **WHEN** no explored, passable, unoccupied tile other than the player's own is reachable
- **THEN** no path is planned and travel does not begin

#### Scenario: Planning is deterministic

- **WHEN** the same level, explored mask, entities, player tile, and destination (reachable or not) are planned more than once
- **THEN** the same best-approach goal (when the destination is unreachable) and the same ordered sequence of steps result every time

#### Scenario: Unexplored tiles are not routed through

- **WHEN** the only route to the destination passes through a tile that has not been explored
- **THEN** no route through that tile is planned

#### Scenario: Non-passable tiles are not routed through

- **WHEN** the only route to the destination passes through a non-passable tile
- **THEN** no route through that tile is planned

#### Scenario: Living occupants are not routed through

- **WHEN** the only route to the destination passes through a tile occupied by a living entity
- **THEN** no route through that tile is planned

### Requirement: Travel stops when the destination is reached or the path is interrupted

Auto-travel SHALL stop when the player reaches the planned goal tile — the chosen destination, or the best-approach tile when the chosen destination was unreachable — when the next step is blocked or the path is interrupted, when the next step would arrive on the stairs tile, or when the level changes. A stopped travel SHALL dispatch no further move commands.

#### Scenario: The destination is reached

- **WHEN** the player's tile becomes the planned goal tile (the chosen destination, or the best-approach tile when the chosen destination was unreachable)
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

## ADDED Requirements

### Requirement: A travel tap that cannot begin travel gives feedback

When a travel-mode tap cannot begin travel — the tile is not explored, passable, and unoccupied; no reachable destination tile exists; or a living monster is orthogonally adjacent — the client SHALL surface a brief, non-blocking indication of the refusal and SHALL dispatch no command. The indication SHALL be presentation-only and SHALL NOT enter game state, the command log, or the save.

#### Scenario: A refused travel tap is surfaced

- **WHEN** a travel-mode tap cannot begin travel
- **THEN** the client shows a brief, non-blocking notice and dispatches no command

#### Scenario: A started travel is not surfaced as refused

- **WHEN** a travel-mode tap begins travel
- **THEN** no refusal notice is shown
