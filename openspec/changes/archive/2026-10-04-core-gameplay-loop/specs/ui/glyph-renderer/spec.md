# Spec Delta

## MODIFIED Requirements

### Requirement: A heads-up display shows progression and health

The renderer SHALL show the current dungeon depth and the player's current hit points, updating as state changes, and SHALL surface the run's terminal status so a dead player is not shown as a normal in-progress run.

#### Scenario: Depth is displayed

- **WHEN** the player descends to a deeper level
- **THEN** the displayed depth reflects the new level's depth

#### Scenario: Player health is displayed

- **WHEN** the renderer is given a state whose player hit points value differs from another state's
- **THEN** the displayed hit points reflect the player's current value

#### Scenario: The terminal status is surfaced

- **WHEN** the run has ended
- **THEN** the renderer shows a game-over surface rather than the ordinary in-progress view

## ADDED Requirements

### Requirement: Monsters, items, and stairs are drawn from state using pack glyphs

The renderer SHALL draw monsters, floor items, and the stairs on visible tiles, using the glyph supplied by the loaded content pack for each entity kind and a distinct `STAIRS_GLYPH` (e.g. `'>'`) for stairs (terrain has no pack glyph), with the player distinguishable from all of them. `tileRender` SHALL accept a stairs input and the map view SHALL pass the level's stairs position.

#### Scenario: A visible monster is drawn

- **WHEN** a monster occupies a visible tile
- **THEN** that tile shows the glyph the pack declares for that monster kind

#### Scenario: A visible item is drawn

- **WHEN** a floor item occupies a visible tile
- **THEN** that tile shows the glyph the pack declares for that item kind

#### Scenario: Stairs are drawn distinctly

- **WHEN** the stairs tile is visible
- **THEN** it is drawn with `STAIRS_GLYPH`, distinct from ordinary floor

#### Scenario: Occupants on explored-but-not-visible tiles are not shown

- **WHEN** a tile has been explored but is not currently visible
- **THEN** no monster, item, or stairs is shown as an occupant on it (the flat terrain is shown)

### Requirement: A game-over surface renders from the terminal state

The renderer SHALL render the game-over surface from the terminal run status, presenting an unmistakable end-of-run state rather than a frozen or unchanged screen.

#### Scenario: Game over replaces the play view

- **WHEN** the run's status becomes terminal
- **THEN** the renderer shows a game-over surface and does not continue to render an ordinary playable screen

#### Scenario: Game over is distinct from a frozen map

- **WHEN** the player dies
- **THEN** the surface makes the end of the run explicit (for example a title/message) rather than leaving the map unchanged with no explanation

#### Scenario: A new run clears the game-over surface

- **WHEN** the client starts a fresh run after game over
- **THEN** the renderer shows the ordinary play view for the new run
