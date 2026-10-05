# content/second-pack Specification

## Purpose
Proves that a second, thematically unrelated content pack (a comedic "family dog" setting) is expressible entirely as version-2 pack data and loads without any engine or schema change — the executable form of the project's abstraction-leak test.

## Requirements

### Requirement: A second pack is authored as data under the same schema

A second content pack SHALL exist under `src/packs/dogs/` as plain JSON data declaring `version: 2`, an identity, and the three required collections (classes, monsters, items), authored so that it satisfies the existing pack schema. The pack SHALL be supplied as raw JSON and SHALL NOT be cast to a validated pack type: the only path from raw data to a validated pack SHALL be `loadPack`/`validatePack`.

#### Scenario: The dogs pack validates against the unchanged schema

- **WHEN** the dogs pack data is validated against the engine pack schema
- **THEN** validation succeeds with no schema, registry, or version change required

#### Scenario: The dogs pack meets the composition floor

- **WHEN** the dogs pack is loaded
- **THEN** it declares at least two classes, at least one monster, and at least one item, and its declared version equals the engine's current pack version

#### Scenario: The pack is not a cast

- **WHEN** a malformed edit is made to the dogs pack JSON
- **THEN** validation fails loudly because the value is still raw, uncast data

### Requirement: The dogs theme uses only existing schema vocabulary

Every dogs entry SHALL use only the fields, behavior ids, and effect kinds the version-2 schema already expresses, so the pack demonstrates the theme is data-routed rather than requiring new engine vocabulary. Monsters SHALL declare a `behavior` id drawn from the engine's existing behavior registry and a positive `attack`; classes SHALL declare positive `hp` and `attack`; items SHALL declare an effect of an existing kind with a glyph.

#### Scenario: Monster behavior ids are already-registered ids

- **WHEN** each dogs monster's `behavior` is inspected
- **THEN** it is one of the behavior ids the engine already registers, so no new behavior is introduced

#### Scenario: Item effects use existing kinds

- **WHEN** each dogs item's effect is inspected
- **THEN** its kind is one the schema already defines, so no new effect kind is introduced

#### Scenario: Theme is carried entirely by pack strings and glyphs

- **WHEN** the dogs entries are inspected
- **THEN** names and glyphs carry the family-dog theme and no engine code contains dogs-specific content

### Requirement: The second pack loads and runs without engine changes

Introducing and loading the dogs pack SHALL NOT require any change to `src/engine/**`: no new behavior, damage, or effect registry entry SHALL be added, `PACK_VERSION` SHALL remain unchanged, and no schema field SHALL be added. This is the acceptance criterion for the abstraction-leak test.

#### Scenario: Engine source is unchanged

- **WHEN** the stage is complete
- **THEN** the diff of `src/engine/**` is empty and `PACK_VERSION` still equals the version the fantasy pack declares

#### Scenario: The dogs pack loads through the same loader

- **WHEN** the dogs raw data is passed to the existing pack loader
- **THEN** it returns a usable loaded pack resolvable by id, exactly as the fantasy pack does

#### Scenario: A leak is surfaced, not papered over

- **WHEN** expressing any part of the dogs theme appears to require an engine edit
- **THEN** that requirement is recorded as an abstraction leak and fixed at the abstraction, rather than satisfied by an engine change
