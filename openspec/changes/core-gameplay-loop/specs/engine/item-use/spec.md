# Spec Delta

## MODIFIED Requirements

### Requirement: Use an item by id

The engine SHALL accept a command to use an item identified by id, resolve that item through the loaded content pack, and apply its effect to the acting entity. Using SHALL consume the item from the acting entity's carried items when it is carried, so a consumed item cannot be used again.

#### Scenario: Using a known item applies its effect

- **WHEN** a use-item command naming an item present in the pack is applied to a state whose actor exists and carries that item
- **THEN** the item's effect is applied to the actor, the item is removed from the actor's carried items, and an event describing the outcome is emitted, with the input state unchanged

#### Scenario: Using an unknown item is rejected without corruption

- **WHEN** a use-item command names an item not present in the loaded pack
- **THEN** the engine emits a no-op or error event and returns state equivalent to the input, without throwing

#### Scenario: Using an item with no actor is rejected without corruption

- **WHEN** a use-item command is applied but the acting entity does not exist in the state
- **THEN** the engine emits a no-op event and leaves the state equivalent to the input

## ADDED Requirements

### Requirement: Items lie on the floor and can be picked up

The engine SHALL represent floor items as entities on passable tiles of the level, drawn from the loaded content pack, and SHALL allow the player to pick one up so it becomes a carried item referenced by id.

#### Scenario: A generated level contains floor items

- **WHEN** a level is generated with a loaded content pack and a seeded source
- **THEN** the level contains one or more floor items whose kinds are ids present in the pack, each on a passable tile

#### Scenario: A floor item is referenced by id only

- **WHEN** a floor item exists in state
- **THEN** the state stores the pack content id and does not embed the pack entry

#### Scenario: Floor item placement is deterministic

- **WHEN** the same seed, depth, and pack are used
- **THEN** floor items are placed at the same positions with the same kinds

### Requirement: Item use is driven by carried items

The engine SHALL track the items the player carries as a list of content ids in state, so the UI can offer a carried item for use and the engine can consume it on use.

#### Scenario: A carried item can be offered for use

- **WHEN** the player has picked up items
- **THEN** the state reports the carried item ids in a JSON-serializable list

#### Scenario: Using a carried item consumes one instance

- **WHEN** a carried item is successfully used
- **THEN** exactly one instance of that id is removed from the carried list and the effect is applied

#### Scenario: Carried items round-trip

- **WHEN** state with carried items is serialized and parsed back
- **THEN** the carried list round-trips without loss
