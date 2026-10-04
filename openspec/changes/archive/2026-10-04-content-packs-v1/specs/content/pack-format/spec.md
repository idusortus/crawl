# Spec Delta

## Purpose

Defines the versioned, theme-agnostic data schema that every content pack must satisfy, and the validation behavior that makes an invalid pack fail loudly rather than degrade the game silently.

## ADDED Requirements

### Requirement: Pack declares identity and version

A content pack SHALL declare an id, a human-readable name, and a schema version, so packs are identifiable, selectable by id, and forward-checkable as the schema evolves.

#### Scenario: Valid identity is accepted

- **WHEN** a pack declares a non-empty id, a name, and a supported schema version
- **THEN** validation succeeds and the pack's id is available for selection

#### Scenario: Missing or empty identity is rejected

- **WHEN** a pack omits or leaves empty its id, name, or schema version
- **THEN** validation fails and reports which field is missing or invalid

#### Scenario: Unsupported schema version is rejected

- **WHEN** a pack declares a schema version the engine does not support
- **THEN** validation fails with a message naming the unsupported version, rather than loading the pack

### Requirement: Pack defines classes, monsters, and items

A content pack SHALL define collections of playable classes, monsters, and items, each entry identified by a stable id and carrying the display strings, glyph, and stats the engine resolves by id.

#### Scenario: Complete collections validate

- **WHEN** a pack provides at least two classes, at least one monster, and at least one item, each with a unique id, a display name, a glyph, and the stats the schema requires
- **THEN** validation succeeds and all ids are resolvable

#### Scenario: Duplicate ids within a collection are rejected

- **WHEN** two entries in the same collection (classes, monsters, or items) share an id
- **THEN** validation fails and names the duplicated id

#### Scenario: Missing required stat is rejected

- **WHEN** a class, monster, or item omits a stat the schema requires (for example an item's effect, or a monster's health)
- **THEN** validation fails and names the offending entry and the missing field

#### Scenario: Wrong-typed field is rejected

- **WHEN** a field is present but of the wrong type (for example a glyph that is not a string, or health that is not a number)
- **THEN** validation fails and reports the type error at that field's location

### Requirement: Pack supplies theme-agnostic display data

All player-visible text in a pack SHALL be data supplied by the pack, and each entity-bearing entry SHALL provide a render glyph, so no game content or theme wording is hardcoded in the engine.

#### Scenario: Strings and glyphs come from the pack

- **WHEN** the engine needs to display a class, monster, or item
- **THEN** the name string and glyph are read from the pack, and the engine contains no hardcoded content for that entry

#### Scenario: Different packs reuse the same schema

- **WHEN** two packs with different themes (for example fantasy and sci-fi) both satisfy the schema
- **THEN** both validate successfully without any schema change, demonstrating the schema is theme-agnostic

### Requirement: Validation errors are actionable

A failed validation SHALL produce an error that identifies the location and cause of the problem, so a pack author can fix it without reading engine internals.

#### Scenario: Error identifies the failing path

- **WHEN** a pack fails validation
- **THEN** the returned error names the failing field path and describes the problem
