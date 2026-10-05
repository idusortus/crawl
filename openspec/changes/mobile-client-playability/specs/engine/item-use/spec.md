# Spec Delta

## MODIFIED Requirements

### Requirement: Use an item by id

The engine SHALL accept a command to use an item identified by id, resolve that item through the loaded content pack, and apply its effect to the acting entity. Using SHALL consume the item from the acting entity's carried items **only when it is carried**; whether the item is carried gates **consumption, not resolution**, so using an id the actor does not carry still resolves the effect and consumes nothing. An item that declares no `effect` (for example a ranged weapon) SHALL resolve as a no-op that consumes nothing, because it is fired through the ranged-attack command rather than used.

#### Scenario: Using a known item applies its effect

- **WHEN** a use-item command naming an item present in the pack is applied to a state whose actor exists and carries that item
- **THEN** the item's effect is applied to the actor, the item is removed from the actor's carried items, and an event describing the outcome is emitted, with the input state unchanged

#### Scenario: Using a non-carried id still resolves and consumes nothing

- **WHEN** a use-item command names an item present in the pack but absent from the actor's carried items
- **THEN** the item's effect still resolves and applies to the actor, **no** instance is removed from `carriedItemIds`, and an event describing the outcome is emitted, with the input state unchanged (preserving the Stage-2 use-by-id behavior)

#### Scenario: Using an effect-less item is a no-op

- **WHEN** a use-item command names an item present in the pack that declares no `effect` (such as a ranged weapon)
- **THEN** the engine emits a no-op event, does not apply any effect, and removes no instance from `carriedItemIds`, with the input state unchanged

#### Scenario: Using an unknown item is rejected without corruption

- **WHEN** a use-item command names an item not present in the loaded pack
- **THEN** the engine emits a no-op or error event and returns state equivalent to the input, without throwing

#### Scenario: Using an item with no actor is rejected without corruption

- **WHEN** a use-item command is applied but the acting entity does not exist in the state
- **THEN** the engine emits a no-op event and leaves the state equivalent to the input
