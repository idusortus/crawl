# Spec Delta

## ADDED Requirements

### Requirement: The heads-up display describes the object underfoot

The renderer SHALL show a short description of the tile the player occupies when that tile holds a floor item or the level's stairs, and SHALL render no description line for an ordinary empty tile. For a floor item, the description SHALL be the pack item's name together with its optional `description` when the pack declares one, or a generic fallback detail otherwise; when the item's kind is absent from the loaded pack, the line SHALL show a safe generic label rather than throwing. When the tile holds the stairs and no floor item, the line SHALL describe the stairs as leading down. A floor item SHALL take precedence over the stairs when both share the player's tile.

#### Scenario: An item underfoot is described

- **WHEN** the player stands on a floor item whose pack entry declares a description
- **THEN** the HUD shows that item's name and its declared description

#### Scenario: An item without a description falls back

- **WHEN** the player stands on a floor item whose pack entry declares no description
- **THEN** the HUD shows the item's name with a generic fallback detail

#### Scenario: The stairs underfoot are described

- **WHEN** the player stands on the stairs tile with no floor item
- **THEN** the HUD shows a description of the stairs leading down

#### Scenario: An empty tile shows nothing

- **WHEN** the player stands on an ordinary empty tile
- **THEN** the HUD shows no object description line

#### Scenario: An unknown item kind degrades safely

- **WHEN** the player stands on a floor item whose kind is absent from the loaded pack
- **THEN** the HUD shows a safe generic label and the renderer does not crash

#### Scenario: An item takes precedence over the stairs

- **WHEN** a floor item and the stairs share the player's tile
- **THEN** the HUD describes the item rather than the stairs
