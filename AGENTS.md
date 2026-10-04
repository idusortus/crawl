# crawl

> A deterministic, theme-swappable roguelike engine: a pure-TypeScript headless core driven by command-in / event-out over JSON-serializable state, with an Expo + React Native client and all content supplied as swappable data packs.

This file is the tool-agnostic project context. Codex, Cursor, Aider, Gemini CLI, Zed,
and Copilot all read `AGENTS.md` per the [agents.md](https://agents.md) convention.

## Goal
Keep determinism, framework-freedom, and content-agnosticism as *structural* invariants of `src/engine`, so that whole settings (fantasy, sci-fi, "family dog") are swappable data packs rather than engine forks. Milestone 1 ships a headless engine only — no UI — so the boundary is proven before a renderer can blur it.

## Stack
- **Expo SDK** ~57.0.26 + **React Native** 0.86.3 + **React** 19.2.3 (New Architecture)
- **TypeScript** 5.9 (strict), extends `expo/tsconfig.base`
- **Node** ≥ 22.13 (Node 24.x tested)
- Bundler-driven (Metro); no browser CDN scripts.

## Frameworks / Key Libraries
- expo / expo-router — app shell and (later) routing
- Vitest 5 — engine tests (`environment: 'node'`, `vite-tsconfig-paths` for `@engine`)
- ESLint 9 flat config (`eslint-config-expo/flat` + `typescript-eslint`) — enforces the engine boundary
- zod — content-pack schemas (Stage 2, now a direct dependency)

## Engine boundary rules (the important part)
`src/engine` is the whole product; everything else is a client of it. These rules are enforced and must not be relaxed:

- **Pure TypeScript.** No `react`, `react-native`, or `expo*` imports. No `Math.random`, `Date.now`, or `Date`. ESLint on `src/engine/**` fails CI on any of these.
- **Command-in / event-out.** The content-free entry point is `applyCommand(state, command, rng) -> { state, events }`; content-dependent commands (`use-item`) go through `applyCommandWithPack(state, command, rng, pack)`. Both return a **new** state; the input is never mutated. Every command emits ≥ 1 event.
- **JSON-serializable state.** `GameState` contains only plain data — no classes, `Map`, `Set`, functions, or meaningful `undefined`. Save/replay/undo are serialization plus the command log.
- **Injected seeded RNG.** All randomness flows through an `Rng` created from state and written back into state (`{ seed, state }`). Same seed + same commands ⇒ identical outcome.
- **Content is data, never code.** Content lives in `src/packs` (Stage 2+) as versioned pack data, validated through `loadPack`/`validatePack` and referenced by id/kind only. The engine never embeds content; `GameState` stores ids, never resolved entries. Effect behavior is a named registry lookup (`effectRegistry`), never pack-supplied logic.
- **Behaviors by named id** (later stages): AI/behaviors will be looked up by a named registry id rather than engine-embedded closures.
- **Import through the public surface.** Outside `src/engine`, import only from `@engine` (`src/engine/index.ts`) — never a deeper module.

For the full staged roadmap, see `PROJECT.md`. Stages 1–3 (`bootstrap-engine-skeleton`, `content-packs-v1`, `levelgen-and-fov`) are complete. The **APK pipeline** change (produce an installable Android APK) is in progress — workflow authored, pending its first live tag run — before Stage 5 (`expo-glyph-renderer`).

## Constraints
- Do not add features ahead of the current stage (no levelgen/FOV/AI/combat/render until their stage).
- Do not weaken the `src/engine` purity rules to make a feature fit; treat any needed engine change from a new pack as an abstraction leak to fix.

## Workflow
1. Read `PROJECT.md` for the long-form vision.
2. Check `STATE.md` for current status, blockers, in-flight decisions.
3. Check `decisions.md` for architectural decisions already locked in.
4. Per-agent memory lives in `histories/<agent>.md`.
5. Append a session summary to `agent-diary.md` when work completes.

<!-- CODEGRAPH_START -->
## CodeGraph

This project is configured to use [CodeGraph](https://codegraph.ru) for graph-backed codebase context.
When you need to understand relationships, call paths, or impacts, use:

```
codegraph explore "<your question>"
```

The CodeGraph MCP server is registered in the project config. Run `codegraph init` in this directory
if the project has not been indexed yet.
<!-- CODEGRAPH_END -->

<!-- JEV_TIER_ROUTING_START -->
## Tier routing

Before planning, call the `tier_classifier` tool once with the task description.

- If it returns `confidence` >= 0.6, use its `tier` (trivial | minor | major) as your planning depth.
- If `confidence` < 0.6, or the tool is unavailable, use your own judgment and default to `major`.
- The classifier is optional: it uses real Jev when a credential is available (Jev is free on OpenCode) and a local heuristic otherwise. Never block or fail a turn because the tool is unavailable.
<!-- JEV_TIER_ROUTING_END -->
