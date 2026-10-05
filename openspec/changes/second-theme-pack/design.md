# Design

## Context

See proposal.md — Why. The relevant current state, established by reading the tree before drafting:

- **The version-2 pack format already exists.** `src/engine/schema/pack.ts` defines `PACK_VERSION = 2` and the zod schemas: classes with `id`/`name`/`glyph`/`hp`/`attack`(+optional `description`); monsters with `id`/`name`/`glyph`/`hp`/`behavior`/`attack`(+optional `description`); items with `id`/`name`/`glyph`/`effect` where effect is `{kind:'heal',amount}` or `{kind:'roll-heal',min,max}`. `loadPack` in `src/engine/pack.ts` enforces the composition floor `MIN_CLASSES=2` / `MIN_MONSTERS=1` / `MIN_ITEMS=1`.
- **The fantasy pack is the reference.** `src/packs/fantasy/pack.json` is version 2: 2 classes, 3 monsters, 5 items. `src/packs/fantasy/index.ts` exports the raw JSON (`export const fantasyPack = rawPack`) with no cast, plus an inferred `Pack` type for documentation. `src/packs/fantasy/__tests__/fantasy-pack.test.ts` loads it and asserts schema, composition, and theme.
- **Behavior and effect vocabulary is registered in the engine.** `behaviorRegistry` in `src/engine/ai.ts` registers exactly `chase` and `idle`; an unknown id degrades safely to `idle`. `src/engine/schema/pack.ts` defines exactly the `heal` and `roll-heal` effect kinds. The engine's damage registry (introduced in `core-gameplay-loop`) supplies `melee` internally; packs never name a damage kind.
- **The app selects its pack by import.** `src/ui/hooks/useGame.ts` imports `fantasyPack` from `../../packs/fantasy` and calls `loadPack(fantasyPack)` at startup. There is no pack-selection UI.
- **The vitest include already covers `src/packs`.** The fantasy pack test lives under `src/packs/fantasy/__tests__/` and is run by the existing config, so a dogs test in the mirrored location needs no test-config change.
- **Constraints.** `src/packs` is outside the `src/engine` purity boundary, but the whole stage must leave `src/engine/**` byte-identical (the abstraction-leak test). No new dependency is allowed.

## Goals / Non-Goals

**Goals:**
- Prove the version-2 schema can express a thematically unrelated pack as pure data.
- Produce a dogs pack that loads through the *existing* `loadPack`/`validatePack` with no engine cooperation.
- Make "no engine changes" an explicit, checkable acceptance criterion rather than an implicit hope.
- Mirror the fantasy pack's structure and test pattern so the second pack is a copy-shaped data artifact, not a special case.

**Non-Goals:**
- Any change to `src/engine/**` — schema, loader, registries, `PACK_VERSION`, or events.
- A user-facing pack picker or runtime pack switching (a `src/ui` concern; out of scope, and would not require engine support anyway).
- New behaviors, damage kinds, or effect kinds beyond those already registered.
- Balance/tuning of the dogs pack beyond "positive stats that pass the schema" — content owns balance.

## Decisions

### D1: A new capability `content/second-pack` (a real spec), not `skip_specs`
The project used `skip_specs` only for tooling-only changes. This stage ships observable content and a testable claim ("a second pack loads and the format needs no new field"), so it warrants a small spec. A new capability is the right shape rather than a delta on `content/pack-format`: that capability's existing requirements already say the schema is theme-agnostic and reusable across packs, and this change *exercises* those requirements rather than changing them. Adding a delta would either duplicate existing scenarios or force a contrived MODIFIED. `content/second-pack` states the new, concrete artifact-level contract (a dogs pack exists, uses only existing vocabulary, and loads with an empty engine diff). Alternative considered: an ADDED requirement on `content/pack-format` asserting "a second pack exists" — rejected because it conflates the *format's* contract with a specific *artifact's* existence.

### D2: Mirror the fantasy pack exactly
`src/packs/dogs/index.ts` copies the fantasy entry-point shape: import `./pack.json`, export it as `dogsPack` (raw, uncast), export an inferred `Pack` type alias for consumers who have already validated, default-export the raw value. No cast, because a cast would lie about malformed data and defeat the loud-failure contract. Alternative considered: a shared `src/packs/load.ts` helper — rejected as premature abstraction with only two call sites and no behavior to share.

### D3: Theme content stays inside existing vocabulary
Classes ≥2 (e.g. "Good Boy", "Chonker") with positive `hp`/`attack`; monsters ≥1 using `behavior` from `{chase, idle}` and positive `hp`/`attack` (e.g. "mail-carrier", "vacuum", "squirrel"); items ≥1 using `heal` and/or `roll-heal` (e.g. "bone", "treat"). This is deliberate: if the theme appears to need a verb the engine lacks (a new behavior, a new effect kind, a new stat), that is the leak the stage exists to catch, and it is recorded — not satisfied by editing the engine.

### D4: Pack selection stays a one-line UI import
The app continues to hardcode `fantasyPack`. Running the dogs pack is documented as a one-line change in `src/ui/hooks/useGame.ts` (`import { dogsPack } from '../../packs/dogs'` then `loadPack(dogsPack)`). No selection UI is added. This keeps the change focused on the engine-boundary claim; a picker is orthogonal and, if ever built, is a `src/ui` edit that still needs zero engine support. Alternative considered: a small `src/ui` pack switch now — rejected as scope creep that would obscure the single-variable leak test.

### D5: "No engine changes" is verified by an empty diff plus a sentinel test
Verification is mechanical: `git diff --stat -- src/engine` is empty (or the worktree has no engine modifications), and `PACK_VERSION`/the loaders/registries are reread from disk and asserted unchanged. The dogs pack test additionally asserts every monster behavior id is a key of the engine's exported `behaviorRegistry` and every item effect kind is a schema-defined kind — so a future leak that silently adds vocabulary is caught rather than celebrated.

## Risks / Trade-offs

- **[A theme detail appears to need a new engine verb, tempting an engine edit]** → Treat it as the finding the stage exists to produce: record it in the proposal/design and the diary, and either drop that detail from the pack or fix the generalization at the abstraction as a separate, deliberate change. Never edit `src/engine` to make the dogs data fit.
- **[Dog pack drifts from the fantasy entry shape]** → The test mirrors `fantasy-pack.test.ts` and the entry mirrors `index.ts`; a reviewer diffs `src/packs/dogs` against `src/packs/fantasy` to confirm shape parity.
- **[The new spec overspecifies content]** → Keep requirements about *what the format must express*, not exact names/stats; scenario assertions are about validity, vocabulary reuse, and the empty engine diff, so balance changes never break the spec.
- **[UI still runs fantasy, so the dogs pack is "unused" in the app]** → Acceptable and stated: the pack's contract is loadability and engine-neutrality, proven by tests. Documented one-line switch covers "how to run it".

## Migration Plan

Not applicable — additive content plus tests, no state, save, or schema migration. Rollback is deleting `src/packs/dogs/` and the change directory; the engine was never touched, so there is nothing to revert there.

## Open Questions

None. Scope, vocabulary, and the one-line UI switch are decided above.
