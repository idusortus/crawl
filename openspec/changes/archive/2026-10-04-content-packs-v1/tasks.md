# Tasks

## 1. Dependency & schema foundation

- [x] 1.1 Promote `zod` to a direct dependency at the version already resolved in the lockfile (`zod@^4.6`); verify `npm install` succeeds and `npm test`/`npx tsc --noEmit` still pass
- [x] 1.2 Create `src/engine/schema/pack.ts` with zod schemas for pack identity (`id`, `name`, `version`), classes, monsters, items (id, name, glyph, stats, item effect), and export the inferred TS types; verify `npx tsc --noEmit` passes and the file is lint-clean (no banned globals/imports under `src/engine`)
- [x] 1.3 Add a validation entry point (e.g. `validatePack(input)`) that returns a usable validated pack or an actionable, path-bearing error; verify with a throwaway call in a test that a valid object validates and an invalid one reports the failing path

## 2. Schema validation tests

- [x] 2.1 In `src/engine/__tests__/pack-schema.test.ts`, assert a valid pack passes and each invalid case fails with an actionable message: missing/empty id/name/version, unsupported schema version, duplicate ids within a collection, missing required stat, and a wrong-typed field (glyph not a string, health not a number)
- [x] 2.2 Add a theme-agnostic proof test: a second minimal pack with a non-fantasy theme (e.g. sci-fi ids/strings) validates under the same schema with no schema change
- [x] 2.3 Verify `npm test` passes with the new schema tests and `npm run lint` is clean

## 3. Pack loader & id resolution

- [x] 3.1 Implement `src/engine/pack.ts` `loadPack(input)` that validates then returns a resolved pack supporting id lookup for classes, monsters, and items; unknown ids are reported (typed error or explicit miss), never an ambiguous empty value
- [x] 3.2 Add `src/engine/__tests__/pack-loader.test.ts` covering: a valid pack loads; an invalid pack fails with the validation error and yields no pack; known ids resolve; unknown ids are reported; loading the same pack twice yields equivalent content (determinism)
- [x] 3.3 Add a test asserting content is NOT embedded in game state: an entity associated with pack content stores only the id, and a serialized state is well-formed without the pack present
- [x] 3.4 Verify `npm test` passes and `npx tsc --noEmit` is clean

## 4. The fantasy pack (data)

- [x] 4.1 Author `src/packs/fantasy/pack.json` with identity/version and the roadmap minimum — 2 classes, 3 monsters, 5 items — with names, glyphs, stats, and declarative item effects (at least one deterministic effect and one seeded-random effect)
- [x] 4.2 Add `src/packs/fantasy/index.ts` exporting the JSON pack (typed against the schema types); verify the pack validates through `loadPack` in a test (add `src/packs/fantasy/__tests__` or a test under `src/engine/__tests__` that imports it)
- [x] 4.3 Verify the fantasy pack contains zero hardcoded content in the engine (grep the engine for any fantasy string/glyph) and that `npm test` + `npm run lint` pass

## 5. `use-item` command & event

- [x] 5.1 Add an effect registry in `src/engine/effects.ts` mapping effect kind → pure resolver `(actor, effect, rng) -> { actorAfter, applied }`, shipping at least `heal` (deterministic) and a seeded-random effect using the existing `randInt`; verify resolvers are pure and framework-free
- [x] 5.2 Extend `src/engine/events.ts` and `src/engine/types.ts` with a `use-item` command type and an `item-used` event (`{ actorId, itemId, effect }`); keep the unions additive and JSON-clean
- [x] 5.3 Implement pack-aware `use-item` resolution per design D6/D7 (pack-aware entry point; `move` still resolves without a pack): apply the item's effect to the actor, write RNG state back, emit `item-used`; unknown item, unknown effect kind, or missing actor → `noop` (never throw); verify the input state is not mutated
- [x] 5.4 Add `src/engine/__tests__/item-use.test.ts` covering: deterministic effect applied and event emitted; unknown item → noop without corruption; missing actor → noop; `item-used` round-trips through JSON; unknown command types still degrade to noop after the union widens
- [x] 5.5 Add the RNG-divergence-through-`applyCommand` test (Stage-1 review Finding 2): the same seeded-random `use-item` from the same seed reproduces identical state+events, and two different seeds diverge; verify it passes

## 6. Public surface, verification & docs

- [x] 6.1 Export the new schema types, `validatePack`/`loadPack`, effect registry access, and the extended command/event types from `src/engine/index.ts`; verify a consumer can load the fantasy pack and run a full content-driven flow importing only `@engine` (add/extend a public-surface test)
- [x] 6.2 Run the full suite + lint + engine-scoped lint + `tsc --noEmit` and confirm all green with zero boundary violations under `src/engine`
- [x] 6.3 Update `STATE.md`, append a `decisions.md` entry for the pack format/versioning and the D6 command-entry choice, and log the session in `agent-diary.md`/`histories/*`; update the roadmap status in `PROJECT.md`/`AGENTS.md` pack notes as needed
- [x] 6.4 Update `openspec/config.yaml` project context only if the pack conventions warrant it; verify `openspec validate content-packs-v1 --strict` passes
