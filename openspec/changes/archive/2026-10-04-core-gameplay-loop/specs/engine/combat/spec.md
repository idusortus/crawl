# Spec Delta

## Purpose

Defines how attacking resolves between adjacent entities: damage drawn from the injected seeded source, hit-point reduction, entity death and removal, and the terminal player-death (permadeath) outcome that ends a run.

## ADDED Requirements

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
