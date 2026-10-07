# Spec Delta

## MODIFIED Requirements

### Requirement: Tapping the map in travel mode selects an explored destination

While travel-target mode is active, a tap on a tile that is already explored, passable, and free of any living entity SHALL set that tile as the travel destination and begin auto-travel through the same single command path. Travel SHALL NOT begin while a living monster is orthogonally adjacent to the player, because the first step would walk into immediate danger; a living monster that is merely visible to the player but not orthogonally adjacent SHALL NOT prevent travel from beginning (the auto-travel post-step danger stop governs that case). A tap on an unexplored tile, a non-passable tile, a tile occupied by a living entity, or any tile outside the grid SHALL dispatch nothing and SHALL end travel-target mode. Only explored tiles SHALL be targetable. Travel mode is a distinct map-tap mode, alongside the existing normal and ranged-target modes.

#### Scenario: Tapping an explored tile starts travel

- **WHEN** travel-target mode is active and the user taps an explored, passable, unoccupied tile
- **THEN** that tile becomes the travel destination and auto-travel begins through the shared command path

#### Scenario: Travel does not begin while a monster is already visible or adjacent

- **WHEN** travel-target mode is active, a living monster is already orthogonally adjacent to the player, and the user taps an explored, passable, unoccupied tile
- **THEN** auto-travel does not begin and no move command is dispatched

#### Scenario: A visible but non-adjacent monster does not block travel

- **WHEN** travel-target mode is active, a living monster is visible to the player but not orthogonally adjacent, and the user taps an explored, passable, unoccupied tile
- **THEN** auto-travel begins (and the post-step danger stop may halt it after a step)

#### Scenario: An unexplored tile is not a destination

- **WHEN** travel-target mode is active and the user taps a tile that has not been explored
- **THEN** no command is dispatched and travel-target mode ends

#### Scenario: A non-passable or occupied tile is not a destination

- **WHEN** travel-target mode is active and the user taps a non-passable tile or a tile occupied by a living entity
- **THEN** no command is dispatched and travel-target mode ends

#### Scenario: Only explored tiles are targetable

- **WHEN** travel-target mode is active
- **THEN** an unexplored tile can never be selected as a destination
