# Proposal

## Why

Stage 1 proved the engine loop but the engine has **no notion of content**: `Entity.kind` is a free-form string that nothing resolves, and there is no place for a theme to supply what a "goblin" or a "sword" actually is. The entire value proposition of `crawl` — one engine, many themes (fantasy, sci-fi, "family dog") — depends on content being **data packs validated at load**, not code embedded in the engine. This stage makes that seam real while the codebase is still small, and adds the first command that consumes both pack data and the injected RNG.

## What Changes

- **Introduce a content-pack format** as plain JSON data: species/classes, monsters, and items, each with ids, display strings, glyphs, and stats. Packs are theme-agnostic data — the same schema will describe a sci-fi or "family dog" pack later.
- **Add zod validation at load.** A malformed or incomplete pack fails loudly with a clear error instead of producing an engine that misbehaves at runtime. Types are inferred from the schemas where practical.
- **Add a pack loader + registry** that reads and validates a pack into a JSON-clean, in-memory structure the engine can consult by id — without storing content inside `GameState` (which would bloat every save).
- **Author a first fantasy pack** covering the roadmap's minimum: 2 playable classes, 3 monsters, 5 items, plus name strings and glyphs — entirely as data under `src/packs/fantasy/`.
- **Add the first content-driven command, `use-item`**, which resolves an item from the pack and draws from the injected seeded RNG (e.g. a random effect/heal roll). This proves content → command → RNG → event wiring end to end and closes the Stage-1 review's Finding 2 (the RNG's divergence path was never exercised through `applyCommand`).
- **Add a `used`/`item-used` event** to the event union so the new command's outcome is observable, matching the existing event conventions.

**Non-goals (later stages):** no level generation or FOV (Stage 3), no rendering (Stage 4), no monster AI, combat, inventory UI, equipment slots, or permadeath (Stage 5). `use-item` is the minimum command that proves the seam — not a full inventory system.

## Capabilities

### New Capabilities
- `content/pack-format`: The versioned schema for a theme data pack (classes, monsters, items, strings, glyphs) and the validation rules that make a malformed pack fail loudly at load.
- `content/pack-loader`: Loading and indexing a validated pack so the engine can resolve content by id without embedding content in game state.
- `engine/item-use`: A `use-item` command that resolves an item through the loaded pack and applies a seeded-random effect, emitting an observable event.

### Modified Capabilities
- `engine/command-loop`: The command union and event union grow to include `use-item` and its outcome event; the existing command-in/event-out contract is extended, not changed.

## Impact

- **New code**: `src/engine/schema/` (zod schemas + inferred types), `src/engine/pack.ts` (loader + registry), a `use-item` path in `src/engine/commands.ts`, a new event in `src/engine/events.ts`, and new exports in `src/engine/index.ts`.
- **New content**: `src/packs/fantasy/` (JSON pack + entry point), the first real pack.
- **New dependency**: `zod` promoted from a transitive dependency to a direct one (already resolved at `zod@4.6.x` in the lockfile).
- **New tests**: pack schema validation (valid + each invalid case), loader behavior, `use-item` resolution, and a seeded RNG-divergence-through-`applyCommand` test.
- **Docs**: `STATE.md`, `decisions.md`, roadmap status, and `PROJECT.md`/`AGENTS.md` pack notes updated.
- **No breaking changes**: existing M1 specs' requirements are unchanged; `GameState` shape is unchanged (content stays outside state). The command/event unions widen additively, and unknown commands still degrade to `noop`.
