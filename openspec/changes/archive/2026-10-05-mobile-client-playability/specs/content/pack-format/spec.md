# Spec Delta

## MODIFIED Requirements

### Requirement: Pack defines classes, monsters, and items

A content pack SHALL define collections of playable classes, monsters, and items, each entry identified by a stable id and carrying the display strings, glyph, and stats the engine resolves by id. Monsters SHALL additionally declare a behavior by named id and an attack damage value, and classes SHALL declare an attack damage value; items SHALL remain resolvable by id. An item SHALL declare **at least one** of a consumable `effect` (the existing heal / roll-heal union) or a `ranged` weapon descriptor (`{ range, damage }`, plain declarative data), so an item is either usable or a weapon and never inert. Making `effect` optional and adding `ranged` SHALL NOT require a schema-version bump because packs that already declare an `effect` remain valid and a pack with no ranged item simply has no ranged weapon. These additions SHALL be plain declarative data and SHALL be required by the schema (a pack omitting required entries/stats fails validation, independently of the declared version).

#### Scenario: Complete collections validate

- **WHEN** a pack provides at least two classes, at least one monster, and at least one item, each with a unique id, a display name, a glyph, and the stats the schema requires
- **THEN** validation succeeds and all ids are resolvable

#### Scenario: An item may declare a ranged weapon instead of an effect

- **WHEN** an item declares `ranged: { range, damage }` with a positive integer range and positive damage and no `effect`
- **THEN** validation succeeds and the item is resolvable by id as a ranged weapon

#### Scenario: An item must declare an effect or a ranged weapon

- **WHEN** an item declares neither `effect` nor `ranged`
- **THEN** validation fails and names the offending item and the missing `effect`/`ranged` requirement

#### Scenario: A ranged descriptor with a bad shape is rejected

- **WHEN** an item's `ranged` has a non-positive or non-integer range, or non-positive damage
- **THEN** validation fails and reports the type/bound error at the `ranged` field's location

#### Scenario: Duplicate ids within a collection are rejected

- **WHEN** two entries in the same collection (classes, monsters, or items) share an id
- **THEN** validation fails and names the duplicated id

#### Scenario: Missing required stat is rejected

- **WHEN** a class, monster, or item omits a stat the schema requires (for example an item's effect and ranged descriptor, a monster's health, behavior, or attack value, or a class's attack value)
- **THEN** validation fails and names the offending entry and the missing field

#### Scenario: Wrong-typed field is rejected

- **WHEN** a field is present but of the wrong type (for example a glyph that is not a string, health that is not a number, or a behavior that is the wrong type — e.g. a number rather than a string)
- **THEN** validation fails and reports the type error at that field's location
