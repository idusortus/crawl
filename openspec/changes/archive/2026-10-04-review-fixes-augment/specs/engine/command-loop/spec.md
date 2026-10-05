# Spec Delta

## MODIFIED Requirements

### Requirement: A turn advances monsters after the player acts

When a gameplay command is applied while the run is in progress, the engine SHALL advance monsters exactly once before returning according to an explicit per-outcome rule: a successful `move` (including bump-attack), a successful `attack` hit, a successful `pickup`, and a successful `use-item` advance monsters; a `descend` success advances monsters on the **current** level but the newly generated level's monsters do not act that turn; and a refused `move`/`attack` (no-op, self, empty), an empty `pickup`, a no-op `use-item`, a `descend` off the stairs, a malformed/unknown command, and any command after death SHALL NOT advance monsters. The turn step SHALL re-read the run status and stop advancing the moment the player dies. The descend rule SHALL be observable: after a successful descend, no freshly placed monster on the new level takes an action on that turn, including when a freshly placed monster is within the range at which it would otherwise act.

#### Scenario: Monsters act after a successful player command

- **WHEN** a gameplay command that changes the world (move, bump-attack, attack hit, pickup, or use-item) is applied and the run is in progress and monsters are alive
- **THEN** after the command's own events, each living monster acts once and any events they produce are appended in order

#### Scenario: No-op and refused commands do not advance monsters

- **WHEN** a command that has no world effect is applied (empty/self/blocked attack, a blocked move, a pickup on an empty tile, a no-op use-item, a malformed or unknown command, or a descend off the stairs)
- **THEN** no monster acts and the event log contains only the command's own no-op/blocked event

#### Scenario: Descent advances the current level only

- **WHEN** a descend command succeeds
- **THEN** the new level's monsters are placed but do NOT act on the same turn as the descent

#### Scenario: Descent does not advance a fresh monster in range

- **WHEN** a descend command succeeds and the newly generated level places a monster at a position from which it would otherwise act
- **THEN** the descent emits the level-change outcome and no monster action event follows, so the descend turn is observably inert even when a fresh monster could have acted

#### Scenario: The turn step stops when the player dies

- **WHEN** a monster kills the player during a turn step
- **THEN** no further monster acts on that step and the run is terminal

#### Scenario: Turns are deterministic

- **WHEN** the same command sequence is replayed from the same seed
- **THEN** the interleaving of player and monster events is identical
