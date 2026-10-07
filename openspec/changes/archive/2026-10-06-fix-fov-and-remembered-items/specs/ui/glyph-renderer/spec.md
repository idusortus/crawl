# Spec Delta

## MODIFIED Requirements

### Requirement: Visibility states are visually distinct

The renderer SHALL distinguish, for each tile, three states — currently visible, explored but not currently visible, and never seen — using different visual treatments. An explored-but-not-currently-visible tile SHALL show its terrain dimmed and SHALL NOT show a monster; a remembered floor item MAY be shown dimmed (see the drawing requirement below). A never-seen tile SHALL NOT reveal terrain or entity glyphs.

#### Scenario: Visible tile is drawn at full strength

- **WHEN** a tile is currently visible
- **THEN** its terrain and any entity glyph are drawn in the visible treatment

#### Scenario: Explored tile is drawn dimmed

- **WHEN** a tile has been explored but is not currently visible
- **THEN** its terrain is drawn in a distinct dimmed treatment, no current monster is shown, and any floor item is drawn dimmed

#### Scenario: Unseen tile reveals nothing

- **WHEN** a tile has never been explored
- **THEN** the tile is drawn in the unseen treatment and shows no terrain or entity glyph

### Requirement: Monsters, items, and stairs are drawn from state using pack glyphs

The renderer SHALL draw monsters, floor items, and the stairs on visible tiles, using the glyph supplied by the loaded content pack for each entity kind and a distinct `STAIRS_GLYPH` (e.g. `'>'`) for stairs (terrain has no pack glyph), with the player distinguishable from all of them. The stairs glyph SHALL also be drawn on an explored-but-not-currently-visible tile that holds the stairs, and a floor item's glyph SHALL also be drawn on an explored-but-not-currently-visible tile that holds a floor item, each in the dimmed explored treatment, so remembered features remain findable; monsters SHALL remain hidden on explored-but-not-visible tiles. `tileRender` SHALL accept a stairs input and the map view SHALL pass the level's stairs position.

#### Scenario: A visible monster is drawn

- **WHEN** a monster occupies a visible tile
- **THEN** that tile shows the glyph the pack declares for that monster kind

#### Scenario: A visible item is drawn

- **WHEN** a floor item occupies a visible tile
- **THEN** that tile shows the glyph the pack declares for that item kind

#### Scenario: Stairs are drawn distinctly

- **WHEN** the stairs tile is visible
- **THEN** it is drawn with `STAIRS_GLYPH`, distinct from ordinary floor

#### Scenario: Remembered stairs stay drawn after leaving field of view

- **WHEN** the stairs tile has been explored but is not currently visible
- **THEN** the tile still shows `STAIRS_GLYPH` (dimmed), distinct from ordinary remembered floor

#### Scenario: A remembered item stays drawn dimmed

- **WHEN** a floor item sits on a tile that has been explored but is not currently visible
- **THEN** the tile shows the glyph the pack declares for that item kind, in the dimmed explored treatment

#### Scenario: Occupants on explored-but-not-visible tiles are not shown

- **WHEN** a tile has been explored but is not currently visible and holds a monster or floor item
- **THEN** no monster is shown as an occupant on it (the flat terrain is shown), a floor item is shown dimmed, and the stairs tile still shows `STAIRS_GLYPH`
