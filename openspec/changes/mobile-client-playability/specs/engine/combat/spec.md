# Spec Delta

## ADDED Requirements

### Requirement: Ranged attack resolved against an explicit target

The engine SHALL accept a ranged attack that targets an explicit position and SHALL resolve it only when the player carries a ranged weapon, the target tile holds another living entity within that weapon's range, and the target is currently visible to the player; otherwise the command SHALL produce a no-op without changing the world. The damage SHALL be drawn from the injected seeded random source scaled to the weapon's declared damage, and a lethal ranged hit SHALL remove the target and reuse the same death/permadeath outcomes as melee. Because there is no equipment system, "equipped" SHALL mean "currently carried": the weapon used SHALL be the first carried item whose pack entry declares a ranged descriptor. Firing SHALL NOT consume the weapon (no ammunition is tracked).

#### Scenario: Firing at a visible in-range monster deals damage

- **WHEN** the player carries a ranged weapon and a ranged attack targets a visible living monster within the weapon's range
- **THEN** the target's hit points are reduced by the resolved damage and an event reports the attacker, the target, and the damage dealt with kind `ranged`, with the input state unchanged

#### Scenario: Firing with no ranged weapon is a no-op

- **WHEN** a ranged attack is applied while the player carries no item declaring a ranged descriptor
- **THEN** the engine emits a no-op event and returns state equivalent to the input, without drawing from the RNG

#### Scenario: Firing out of range or at an unseen target is a no-op

- **WHEN** a ranged attack targets a tile beyond the equipped weapon's range, or a tile that is not currently visible to the player
- **THEN** the engine emits a no-op event and does not change any entity's hit points

#### Scenario: Firing at an empty or non-living tile is a no-op

- **WHEN** a ranged attack targets a tile that is empty, out of bounds, non-passable, or holds a non-living occupant
- **THEN** the engine emits a no-op event and returns state equivalent to the input

#### Scenario: A lethal ranged hit removes the target

- **WHEN** ranged damage reduces a monster's hit points to zero or below
- **THEN** the monster is removed from the world, a death event is emitted, and the player does not move onto or swap positions with it

#### Scenario: Firing does not consume the weapon

- **WHEN** a ranged attack resolves successfully
- **THEN** the weapon id remains in the player's carried items and can be fired again

#### Scenario: Ranged combat is deterministic

- **WHEN** the same ranged attack sequence is replayed from the same seed and identical state
- **THEN** the damage dealt, the resulting hit points, and the emitted events are identical

#### Scenario: Ranged state round-trips

- **WHEN** state produced by a ranged attack is serialized and parsed back
- **THEN** it is equivalent to the original and behaves identically for further commands
