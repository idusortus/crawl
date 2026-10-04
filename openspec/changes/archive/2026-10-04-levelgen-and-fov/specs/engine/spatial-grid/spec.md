# Spec Delta

## ADDED Requirements

### Requirement: The world is a level, not a bare grid

Game state SHALL represent the current level as the grid plus level metadata (at least depth and the spawn point), and SHALL carry a per-level explored mask, so the world has progression and memory rather than being a single static grid.

#### Scenario: State carries level metadata

- **WHEN** a level is loaded into game state
- **THEN** the state reports the level's depth and spawn point alongside the grid

#### Scenario: State carries an explored mask

- **WHEN** a level is loaded into game state
- **THEN** the state includes an explored record aligned with the grid's dimensions

#### Scenario: Level data stays JSON-clean

- **WHEN** game state containing a level and explored mask is serialized and parsed back
- **THEN** the level and explored data round-trip without loss and behave identically for further commands

### Requirement: Movement updates explored tiles

When an entity moves on the current level, the engine SHALL update the explored record with the tiles currently visible from its new position, so exploring the level is a side effect of movement.

#### Scenario: Moving reveals on the way

- **WHEN** the player moves to a new tile
- **THEN** tiles visible from the new position are added to the explored record, and previously explored tiles are retained

#### Scenario: Blocked movement does not corrupt the level

- **WHEN** a move is blocked
- **THEN** the level, spawn, and explored record are unchanged apart from any event logging

### Requirement: Entering a level marks the player's vicinity explored

When the player enters a level (including a freshly generated one), the explored record SHALL reflect tiles visible from the spawn point.

#### Scenario: Spawn vicinity is explored on entry

- **WHEN** the player enters a level
- **THEN** the tiles visible from the player's position on entry are marked explored
