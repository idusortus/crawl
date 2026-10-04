# Proposal

## Why

Stage 5 delivered a playable-looking glyph screen, but the world is inert: the player can walk and force a `descend` from any tile, and nothing else can happen. There are no monsters, no combat, no items on the floor, no reachable stairs, no death, and no way to save or resume a run. The engine's determinism/replay promise (`GameState` is JSON-clean + the command log is the session) is designed but never exercised through a real gameplay loop. Stage 6 is the Big Stage that makes `crawl` an actual roguelike: a seeded, fully replayable loop of spawn → fight → loot → descend → die, plus save/load I/O that proves the promise end to end.

## What Changes

- **Monster spawning + AI.** Generated levels are populated with monsters from the loaded pack. Monsters act on a deterministic, seeded behavior selected by a **named registry id** (per `AGENTS.md` "Behaviors by named id") — e.g. chase/attack when the player is visible and in range, else idle/wander. No pack-supplied closures.
- **Combat.** Attacking an adjacent monster (and monsters attacking the player) resolves through HP/damage, emits events, and removes the dead entity. Damage draws through the injected seeded `Rng`.
- **Items on the floor.** Items are placed on the level; walking onto one picks it up (a new command or auto-pickup — decided and documented in design). The existing `use-item` path (`applyCommandWithPack` + `effectRegistry`) gains a UI path.
- **Stairs / descent becomes reachable.** The Level gains a stairs location; a glyph marks it and `descend` is gated on standing on stairs (decided in design).
- **Permadeath.** Player HP reaching 0 ends the run deterministically with a distinct event/state, and the UI shows a game-over surface instead of a silent freeze.
- **Save/load I/O.** A save is the JSON `GameState` plus the **command log**; resume replays commands from the seed (the locked choice). The UI gets a save/resume control (button and/or auto-save).
- **Engine work is in scope this stage** (unlike Stage 5). All additions stay inside the existing invariants: `src/engine` pure, command-in/event-out, JSON-clean state, injected seeded RNG, content-as-data with behaviors by named registry id.
- **BREAKING (internal):** `GameState` gains new plain-data fields (e.g. a run-status / stairs / turn counter) and the `Command`/`GameEvent` unions gain variants. Existing `@engine` exports stay intact; every new field is required and JSON-clean, so serialized fixtures gain fields (as Stage 3 did for `level`/`explored`).

## Capabilities

### New Capabilities
- `engine/combat`: resolving an attack between adjacent entities through HP/damage, seeded damage rolls, death and entity removal, and the player-death (permadeath) terminal outcome.
- `engine/monster-ai`: populating a level with monsters and advancing them deterministically each turn via a named behavior registry (chase/attack, idle/wander).
- `engine/save-load`: serializing a run as JSON `GameState` plus a JSON command log, and resuming by replaying commands from the seed to reproduce the run.

### Modified Capabilities
- `engine/command-loop`: new `attack` / pickup (and any new) command variants; descend gated on stairs; a per-turn step that advances monsters; the run-over terminal state; every new command still emits ≥1 event and degrades malformed input to a noop.
- `engine/item-use`: items can be picked up from the floor (new command or auto-pickup), and the picked item becomes the one `use-item` consumes.
- `engine/level-generation`: a generated level now also reports the monster/item spawns and the stairs location it placed, drawn from the injected RNG, while staying connected and deterministic.
- `engine/spatial-grid`: occupancy/blocking is refined so monster-occupied tiles are attack targets rather than plain `blocked` refusals, and the grid/level carries the terrain features (stairs) the loop needs.
- `content/pack-format`: adds the minimal declarative fields monsters/items need for spawning and combat (e.g. an attack/damage value, and a behavior id on a monster), keeping all behavior as named-id data — a documented seam event.
- `content/pack-loader`: resolves and exposes the new declarative fields by id without embedding content in state, preserving the composition floor.
- `ui/glyph-renderer`: renders monsters, items, and stairs (pack glyphs already exist) plus a game-over surface driven by the terminal state.
- `ui/input-mapping`: adds attack, pick up, use item, and save/resume controls (on-screen and keyboard) that dispatch the new commands.
- `ui/app-shell`: owns the save/resume flow, the game-over UI, and dispatches the new commands immutably through the pack-aware engine entry point.

## Impact

- **Engine:** `src/engine/types.ts` (new commands/events/state fields), `commands.ts` (new branches, stairs gating, per-turn monster step, terminal handling), `level.ts` (spawn placement + stairs), `grid.ts` (attack-target/occupancy refinement), `effects.ts` (damage/death helpers if needed), `index.ts` (public surface additions), new modules for combat and AI. `src/engine/**` stays pure (no react/react-native/expo, no `Math.random`/`Date`).
- **Content:** `src/packs/fantasy/pack.json` gains the new declarative fields; `PACK_VERSION` is bumped if the change alters the meaning of existing data.
- **Client:** `src/ui/**` gains attack/pickup/use/save controls, a game-over surface, and a save/resume/auto-save path; still a pure `@engine` client importing only from the barrel.
- **Tests/docs:** new engine tests (combat, AI, save/replay round-trip, permadeath, stairs), extended existing suites, plus `STATE.md` / `decisions.md` updates after apply.
- **Not in scope:** ECS, a scripting engine, a second theme pack (Stage 7), camera/scrolling, animation, audio, or a web target.
