# engine/combat Specification

## Purpose
Defines how attacking resolves between adjacent entities: damage drawn from the injected seeded source, hit-point reduction, entity death and removal, and the terminal player-death (permadeath) outcome that ends a run.

## Requirements

### Requirement: Attacking an adjacent entity

The engine SHALL accept an attack command that targets the entity in a requested cardinal direction, and SHALL resolve it only when the target tile is occupied by another living entity; otherwise the command SHALL produce a no-op without changing the world.

#### Scenario: Attacking an adjacent monster deals damage

- **WHEN** an attack command is applied in a direction whose tile is occupied by a living monster
- **THEN** the target's hit points are reduced by the resolved damage and an event reports the attacker, the target, and the damage dealt, with the input state unchanged

#### Scenario: Attacking empty space is a no-op

- **WHEN** an attack command is applied in a direction whose tile is empty, out of bounds, or non-passable
- **THEN** the engine emits a no-op event and returns state equivalent to the input, without throwing

#### Scenario: Attacking the player's own tile is rejected

- **WHEN** an attack command would target the attacking entity itself
- **THEN** the engine emits a no-op event and does not change any entity's hit points

### Requirement: Damage is drawn from the injected random source

Where an attack's damage is random, the amount SHALL be drawn from the injected seeded random source, so the same seed and command sequence reproduce identical combat outcomes. An attacker's attack value SHALL come from data copied onto the entity at spawn (a monster's declared `attack`, or the player's class `attack`), never from a pack lookup during resolution; an entity lacking a copied value SHALL use the fixed engine base attack.

#### Scenario: Same seed reproduces the same damage

- **WHEN** the same attack sequence is replayed from the same seed and identical state
- **THEN** the damage dealt, the resulting hit points, and the emitted events are identical

#### Scenario: A monster's declared attack drives the damage it deals

- **WHEN** a monster whose declared attack value is copied onto its entity attacks the player
- **THEN** the damage resolved against the player is derived from that declared attack value (the player entity likewise carries a defined attack value from its class)

#### Scenario: No ambient randomness is used in combat

- **WHEN** combat is resolved
- **THEN** every random draw flows through the injected seeded source and no global random or time source is consulted

### Requirement: Death removes the entity

When an entity's hit points reach zero or below, it SHALL be removed from the world in the same command, and the outcome SHALL be observable.

#### Scenario: A slain monster is removed

- **WHEN** an attack reduces a monster's hit points to zero or below
- **THEN** the monster is no longer present in the state and an event reports the death

#### Scenario: A dead monster no longer blocks or attacks

- **WHEN** a monster has been slain
- **THEN** its former tile is no longer occupied by it and it does not act on subsequent turns

### Requirement: Player death ends the run (permadeath)

When the player's hit points reach zero or below, the run SHALL end deterministically in a distinct terminal state, and the engine SHALL emit an event marking the run as over; thereafter the engine SHALL NOT advance the world or mutate state in response to gameplay commands.

#### Scenario: Player reaching zero hit points ends the run

- **WHEN** damage reduces the player's hit points to zero or below
- **THEN** the returned state is marked as game over (distinct from an in-progress run) and an event marks the run as ended

#### Scenario: Commands after game over do not advance the world

- **WHEN** a gameplay command is applied to a state whose run has ended
- **THEN** the engine emits a no-op event and returns state equivalent to the input, without moving, spawning, or inflicting further damage

#### Scenario: Permadeath is deterministic

- **WHEN** the same sequence of commands that kills the player is replayed from the same seed
- **THEN** the run ends at the same point with the same terminal state and event stream

### Requirement: Combat is observable and serializable

Every combat resolution SHALL emit at least one event describing the outcome as plain serializable data, and any state produced by combat SHALL remain JSON-serializable.

#### Scenario: Combat events are plain data

- **WHEN** an attack resolves (damage, death, or death of the player)
- **THEN** the emitted events carry only plain serializable fields and are appended to the log in order

#### Scenario: Combat state round-trips

- **WHEN** state produced by combat is serialized and parsed back
- **THEN** it is equivalent to the original and behaves identically for further commands

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
