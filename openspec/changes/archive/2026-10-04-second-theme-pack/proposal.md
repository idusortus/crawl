# Proposal

## Why

`crawl`'s core claim is that one engine supports many themes because content is **data**, not code. So far only the fantasy pack exists, so that claim is asserted but never tested against a genuinely different setting: nothing yet proves the version-2 pack format can express a comedic **"family dog"** theme (dogs, bones, vacuum cleaners, mail carriers) without the engine learning anything about it. This stage is the milestone's deliberate **abstraction-leak test** — author a second, wildly different pack with **zero changes to `src/engine/**`**. If the dogs pack needs any engine edit to fit, that is an abstraction leak to surface and fix at the abstraction, not paper over with an engine change.

## What Changes

- **Author a second content pack** `src/packs/dogs/` — a `pack.json` (`version: 2`) with a family-dog theme meeting the composition floor (≥2 classes, ≥1 monster, ≥1 item), plus a thin typed `index.ts` mirroring the fantasy pack (raw JSON exported; **never cast** — validated through `loadPack`/`validatePack`).
- **Add a dogs pack test** `src/packs/dogs/__tests__/dogs-pack.test.ts` mirroring `fantasy-pack.test.ts`: loads via `loadPack`, validates against the schema, and asserts the theme (ids, glyphs, stats, behavior ids from the existing registry, existing item effect kinds) is intact.
- **Prove the engine is unchanged.** The acceptance criterion for the stage is that `git diff src/engine` is empty: `PACK_VERSION` stays 2, no new `behaviorRegistry`/damage/effect registry entries, no schema field, no loader change. An engine edit made *for* the dogs pack is, by definition, a failed leak test.
- **Document how to run the dogs pack.** The app's only pack selection is the one-line import in `src/ui/hooks/useGame.ts` (`loadPack(fantasyPack)`); swapping to the dogs pack is a one-line `src/ui` import change. A user-facing pack picker is **out of scope** for this stage — either a future `src/ui` change or never; the engine stays untouched either way.

## Capabilities

### New Capabilities
- `content/second-pack`: asserts that a second, theme-different pack exists as data under the same version-2 schema and loads/validates with no engine or schema change — the executable statement of the abstraction-leak test.

### Modified Capabilities
<!-- No existing requirement changes: the pack format and loader already specify theme-agnosticism
     (content/pack-format "Different packs reuse the same schema"). This change exercises those
     existing requirements rather than changing them, so no delta spec is needed for them. -->

## Impact

- **New content**: `src/packs/dogs/pack.json` and `src/packs/dogs/index.ts`.
- **New tests**: `src/packs/dogs/__tests__/dogs-pack.test.ts` (picked up by the existing vitest `include`, which already covers `src/packs`).
- **No engine changes**: `src/engine/**` is untouched — no schema, loader, registry, or `PACK_VERSION` change. This is the point of the stage.
- **No UI changes required**: the app can run the dogs pack by a one-line import swap in `useGame.ts`; a startup picker is out of scope.
- **No new dependency**.
- **Docs**: `STATE.md`, `decisions.md`, and `agent-diary.md` record the stage outcome and the no-engine-change verification.
