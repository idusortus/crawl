# Spec Delta

## MODIFIED Requirements

### Requirement: Pack defines classes, monsters, and items

A content pack SHALL define collections of playable classes, monsters, and items, each entry identified by a stable id and carrying the display strings, glyph, and stats the engine resolves by id. Monsters SHALL additionally declare a behavior by named id and an attack damage value, and classes SHALL declare an attack damage value; items SHALL remain resolvable by id. These additions SHALL be plain declarative data and SHALL be required by the schema (a pack omitting them fails validation, independently of the declared version).

#### Scenario: Complete collections validate

- **WHEN** a pack provides at least two classes, at least one monster, and at least one item, each with a unique id, a display name, a glyph, and the stats the schema requires
- **THEN** validation succeeds and all ids are resolvable

#### Scenario: Duplicate ids within a collection are rejected

- **WHEN** two entries in the same collection (classes, monsters, or items) share an id
- **THEN** validation fails and names the duplicated id

#### Scenario: Missing required stat is rejected

- **WHEN** a class, monster, or item omits a stat the schema requires (for example an item's effect, a monster's health, behavior, or attack value, or a class's attack value)
- **THEN** validation fails and names the offending entry and the missing field

#### Scenario: Wrong-typed field is rejected

- **WHEN** a field is present but of the wrong type (for example a glyph that is not a string, health that is not a number, or a behavior that is the wrong type — e.g. a number rather than a string)
- **THEN** validation fails and reports the type error at that field's location

## ADDED Requirements

### Requirement: Monster behavior and attack are declarative data

A monster entry SHALL declare its behavior as a named id string and its attack as a numeric value, and a class entry SHALL declare its attack as a numeric value, so combat and AI behavior remain data the engine interprets through its own registries rather than executable logic supplied by a pack.

#### Scenario: A monster declares a behavior id and attack

- **WHEN** a monster entry is validated
- **THEN** it carries a named behavior id and a numeric attack value, and no executable code

#### Scenario: A class declares an attack value

- **WHEN** a class entry is validated
- **THEN** it carries a numeric attack value the engine copies onto the player entity at spawn

#### Scenario: Behavior ids are theme-agnostic

- **WHEN** two packs with different themes both declare monsters using the same named behavior ids
- **THEN** both validate without a schema change and the engine resolves the behaviors by those ids

#### Scenario: An unknown behavior id is accepted as data

- **WHEN** a monster declares a behavior id the engine does not register
- **THEN** validation still succeeds (the id is data) and the engine degrades to a safe default at run time rather than failing the load

### Requirement: Schema version reflects the new fields

Because the pack format gains fields whose presence the engine now relies on, the pack schema version SHALL be bumped and packs declaring the previous version SHALL fail validation with a message naming the unsupported version.

#### Scenario: A pack of the new version validates

- **WHEN** a pack declares the new schema version and the required monster fields
- **THEN** validation succeeds

#### Scenario: A previous-version pack is rejected

- **WHEN** a pack declares the previous schema version (1)
- **THEN** validation fails with a message naming the unsupported version rather than loading it

#### Scenario: A pack that omits the new required fields is rejected regardless of declared version

- **WHEN** a pack sets the current version but omits a monster's `behavior`/`attack` or a class's `attack`
- **THEN** validation fails and names the offending entry and missing field
