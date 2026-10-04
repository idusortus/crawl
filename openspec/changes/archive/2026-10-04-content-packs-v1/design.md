# Design

## Context

See `proposal.md` → Why. The Stage-1 engine (`src/engine/`) is complete and archived: `GameState` is strictly JSON-clean, `applyCommand(state, command, rng)` is the single mutation point, and `Entity.kind` is an unresolvable free-form string. There are 65 passing tests and an enforced purity boundary (no react/expo, no `Math.random`/`Date`). The three M1 capabilities are `engine/command-loop`, `engine/deterministic-rng`, and `engine/spatial-grid`.

The binding constraint for this stage is the one the proposal names as the project's whole point: **content must be data, validated, and outside game state**. Getting the pack to live *inside* `GameState` would bloat every save and couple save format to pack revision — the exact failure this stage exists to prevent.

## Goals / Non-Goals

**Goals:**
- A versioned, theme-agnostic pack schema meant to describe a sci-fi or "family dog" pack with zero schema change.
- Loud, actionable validation failures at load.
- Content resolved by id, never copied into `GameState`.
- One real content-driven command (`use-item`) that draws from the injected RNG, proving the full content→command→RNG→event seam.

**Non-Goals:**
- No inventory system, equipment slots, stacks, or quantities beyond what `use-item` minimally needs.
- No monster AI, combat, level generation, FOV, or rendering.
- No pack "inheritance"/overlays between packs, no mod loading from disk/network, no hot reload.
- No behavior scripting — items carry declarative effects, not code.

## Decisions

### D1 — Pack content lives outside `GameState`; state references ids
`GameState` is unchanged in shape and keeps only ids (`Entity.kind`, plus the item id named by a command). The loaded pack is a separate value passed to the functions that need it. *Alternatives:* embedding resolved content in state (rejected: bloats saves, breaks replay across pack revisions); global mutable singleton pack (rejected: reintroduces hidden state and breaks the injection discipline the RNG already established).

**Consequence for signatures:** functions that need content take the pack explicitly. `applyCommand(state, command, rng)` keeps its 3-arg shape for M1 compatibility; `use-item` needs the pack, so the design adds a pack-aware entry rather than widening the hot signature (see D6).

### D2 — zod as the schema source of truth, types inferred
Define packs with zod schemas and derive TypeScript types via `z.infer`, so the runtime validator and the compile-time type cannot drift. `zod@4.6.x` is already resolved in the lockfile; promote it to a direct dependency. Validation uses zod's error output to produce path-bearing messages (spec: "Validation errors are actionable"). *Alternatives:* hand-written validators (rejected: two sources of truth); TS types only with no runtime check (rejected: a bad pack then fails deep in the engine instead of at the boundary).

### D3 — Pack shape: identity + three entry collections + name tables
A pack is `{ id, name, version, classes[], monsters[], items[] }` (name-string tables folded into entries as `name`/`description` rather than a separate table, to keep v1 small). Each entry has a stable `id`, a `name`, a `glyph` (single-character string), and its stats. Items carry a declarative `effect` (a discriminated object, e.g. `{ kind: 'heal', amount }` or `{ kind: 'roll-damage'/'roll-heal', min, max }`) — **data, not code**, so effects are serializable and pack-agnostic. This mirrors the "behaviors by named id" rule: the pack names an effect, the engine has a small registry of effect resolvers.

### D4 — Versioning is explicit and checked
The pack declares a schema `version`; the loader accepts only versions the engine supports and rejects others with a naming message. v1 supports exactly `1`. This is the forward-compat seam for later schema evolution.

### D5 — Loader returns a resolved, indexable pack
`loadPack(input)` validates and returns a `LoadedPack` that supports id lookup (`class(id)`, `monster(id)`, `item(id)`). Lookup misses are reported (throw a typed error or return an explicit result), never an ambiguous empty value. If zod's `.parse` throws, the loader surfaces the actionable error; `safeParse` is used where a non-throwing result is wanted. The loaded pack is plain data and deterministic to build.

### D6 — `use-item` is a pack-aware command; keep the core signature stable
Two options were considered for threading the pack into command resolution:
- **(a) Widen `applyCommand` to `applyCommand(state, command, rng, pack)`.** Simple, but changes the M1 hot signature and forces every existing test/caller to pass a pack even for `move`.
- **(b) Keep `applyCommand(state, command, rng)` for content-free commands and add a pack-aware resolution path** (e.g. `applyCommandWithPack(state, command, rng, pack)` or have the pack bound into a resolver), with `use-item` routed through it.

**Choice: (b)**, because it keeps all 65 existing tests and the M1 contract intact and makes the content dependency explicit only where it is actually needed. The exact shape (a separate function vs. an options argument) is settled in tasks; the invariant is that `move` still resolves without a pack and `use-item` cannot.

### D7 — `use-item` effect resolution and RNG threading
Resolving a `use-item` command: find the actor (`state.playerId`), resolve the named item in the pack, look up the effect in the effect registry, and if the effect is random, draw via the injected `Rng` using the existing `randInt`. The `rng` is written back into the returned state exactly as M1 does. Results are emitted as a new `item-used` event carrying `{ actorId, itemId, effect }` (plain data), appended to the log. Missing actor or unknown item → `noop` (never throw), consistent with M1's malformed-command handling.

**This also closes Stage-1 review Finding 2:** because `use-item` draws from the RNG, a test can now assert two different seeds diverge *through* `applyCommand` — the divergence path that M1-only coverage could not exercise.

### D8 — Effect registry: named effects, no scripting
A small registry maps an effect `kind` string to a pure resolver `(actor, effect, rng) -> { actorAfter, applied }`. v1 ships a couple of effects (e.g. `heal` deterministic, `roll-heal` random). Packs reference kinds by name; an unknown effect kind is a validation-time concern if the schema enumerates kinds, otherwise a runtime `noop`. No eval, no embedded functions — same posture as the engine's behavior rule.

### D9 — The fantasy pack is data-only, under `src/packs/fantasy/`
The first pack ships JSON (mirroring the eventual theme packs) plus a tiny TypeScript entry that imports and exports it, so the app can `import fantasy from '@/packs/fantasy'`. Content: 2 classes, 3 monsters, 5 items, matching the roadmap. `src/packs` is already outside the engine purity boundary, so JSON + a thin TS entry is fine there; the engine only ever receives the validated object.

### D10 — Testing
Tests cover: valid pack passes; each invalid case fails with an actionable path (missing id, duplicate id, wrong type, unsupported version); loader resolves known ids and reports unknown ids; `use-item` applies a deterministic effect, a random effect reproduces under the same seed and diverges across seeds, and the `item-used` event is emitted + JSON round-trips; the extended unions keep unknown commands degrading to `noop`. RNG-divergence-through-`applyCommand` is the explicit regression test for Finding 2.

## Risks / Trade-offs

- **Schema churn as later stages add fields** → Mitigation: explicit `version` + reject-unknown-version, and additive fields with sensible optionality; revisit the schema in Stage 5 when combat/equipment need more.
- **Two command entry points (D6) can confuse callers** → Mitigation: keep exactly one public surface in `index.ts`, name them unambiguously, and document that `use-item` requires a pack; add a test that `move` works without one.
- **Effect registry could silently grow into a scripting language** → Mitigation: registry entries are pure, typed, and enumerated; packs name effects, never inline logic. Treat any need for pack-supplied logic as an abstraction leak to surface.
- **"Content not in state" vs. convenience** → Mitigation: the loader test asserts state stores ids only, and that a state is well-formed without the pack present.
- **zod bundle/runtime cost in the engine** → Mitigation: pack validation runs at load, not per-frame; promote zod to a direct dependency; if bundle size ever bites, `@zod/mini` is a drop-in for the schemas.

## Migration Plan

Greenfield within the project — additive. Order: add `zod` as a direct dependency → author schemas → loader + registry → fantasy pack → `use-item` command/event → wire exports → tests → docs. Existing tests must remain green throughout; `GameState` shape is unchanged, so no data migration is required. Rollback is a revert of the stage.

## Open Questions

None that block this stage. Whether `use-item` is exposed as a separate function or an options argument (D6) is an implementation detail settled in tasks and does not change the specs or approach.
