# Design

## Context

See `proposal.md` — Why. This is a **backfill**: the implementation already exists as uncommitted working-tree code, and this design records the decisions that code embodies so the specs and tasks can be checked against it during apply. The relevant existing constraints:

- `src/engine/**` is pure TypeScript with injected seeded RNG, JSON-serializable state, and no `Math.random`/`Date` (ESLint-enforced). Commands and events are discriminated unions (`src/engine/types.ts`), constructed through `src/engine/events.ts`, and resolved by `applyCommand` (content-free) and `applyCommandWithPack` (pack-aware) in `src/engine/commands.ts`. A shared `advanceTurn` wrapper runs the monster step only when the command's own events are members of `ADVANCING_EVENT_TYPES`; `noop` is deliberately **not** a member.
- `src/ui/**` is a pure `@engine` consumer (imports only the barrel). Framework-free logic helpers live in `src/ui/logic/*` and are unit-tested under the node Vitest environment; React components live in `src/ui/components/*`. The HUD is owned by the `ui/glyph-renderer` capability; control applicability and the D-pad/keyboard mappings are owned by `ui/input-mapping`.

## Goals / Non-Goals

**Goals:**

- A deterministic, replayable "pass a turn" action that monsters respond to, reachable from the D-pad and (on web) the keyboard.
- A readout of the item or stairs under the player, and an action bar that only offers actions the engine will accept.
- Keep the engine/content boundary intact: the wait command is content-free and pack-free replayable, and no UI feature embeds engine behavior.

**Non-Goals:**

- No change to save format, replay semantics, or `PACK_VERSION`.
- No ambient randomness or wall-clock time in the engine.
- No equipment/inventory surface, and no new monster AI behavior beyond the existing once-per-turn step.
- No new UI capability: each feature lands in the capability that already owns that surface.

## Decisions

### D1 — Wait is a new `waited` event, not a reused `noop`

The wait command emits a new JSON-clean `WaitedEvent { type: 'waited' }` constructed by a `waited()` factory, and `'waited'` is added to `ADVANCING_EVENT_TYPES` so the shared `advanceTurn` wrapper runs the monster step.

- **Why not reuse `noop`.** By contract `noop` means "the command produced no effect" and is never a member of the advance matrix (the existing spec's "Ineffective command yields a no-op event" and "No-op and refused commands do not advance monsters"). A wait is not ineffective — it is the deliberate effect of passing the turn — so overloading `noop` would either falsely claim no effect or, if `noop` were added to the matrix, make genuinely refused commands advance monsters. A distinct event keeps "wait happened" observable and the no-op contract intact.
- **Alternatives.** (a) Emit `noop('waited')`: rejected — a no-op with a reason string cannot carry the advance decision without special-casing the reason, and it muddies the no-op contract. (b) Advance directly in `applyWait` without an event: rejected — every command must emit at least one event, and the monster step is driven by the emitted event type.

### D2 — Wait is parameterless, content-free, and shared by both entry points

`WaitCommand = { type: 'wait' }` carries no payload, so any key beyond `type` is structurally malformed. A private `resolveWait` checks for extra keys and degrades to `noop('malformed-command')` (never advancing, because `noop` is not in the advance matrix); otherwise it resolves `applyWait` through the shared `advanceTurn` wrapper. Because the command needs no pack data, both `applyCommand` and `applyCommandWithPack` route `type === 'wait'` to `resolveWait` before their `switch` statements, so the two entry points agree.

- **Why not put it only in `applyCommandWithPack`.** The client dispatches through the pack-aware entry point, but a wait is content-free and must replay pack-free; making both resolve it keeps the command log portable and the content-free path complete (the same posture as `pickup`/`move`).
- **Alternatives.** (a) A direction-bearing wait (e.g. face a direction): rejected — v1 has no facing, and the request is simply "pass a turn". (b) Resolve in only one entry point and let the other no-op: rejected — it would make the same command log diverge depending on which entry point replays it.

### D3 — The object description line is derived presentation-only UI

`src/ui/logic/objects.ts` adds pure helpers `floorItemAt(state)`, `isOnStairs(state)`, and `objectInfoAt(state, pack)` returning `{ title, detail } | undefined`. `ObjectInfo.tsx` renders the result from the game context and renders `null` when it is `undefined`. The helpers import only the `@engine` barrel (`entityById`, `isFeature`, `isStairs`, types), so nothing enters `GameState` and the logic is testable without a renderer. `floorItemAt` scans `state.entities` for the feature sharing the player's tile rather than taking the first `entityAt` occupant, because the player and the item share a tile and entity order must not decide the result.

- **Item-over-stairs precedence (assumption, recorded).** When a floor item and the stairs share the player's tile, the item wins: a visible item on the stairs is the more specific, actionable thing to read, and the stairs remain discoverable through the existing HUD stairs hint. The alternative (stairs win) would hide an item the player can pick up.
- **Generic fallback copy (assumption, recorded).** A pack item's `description` is optional and no pack in this repo authors one, so the common path is a generic detail; the exact copy ("An item resting on the floor.") is a presentation choice, not a contract, and tests pin it as a constant so it can change freely.
- **Unknown item id degrades safely.** `LoadedPack.item(id)` throws `UnknownContentIdError` on a miss, so the lookup is wrapped and falls back to a generic "Unknown item" label rather than throwing at the HUD. The same fallback posture as the renderer's unknown-glyph case.

### D4 — The action bar hides actions the engine would refuse

`ActionBar.tsx` derives `canPickUp = floorItemAt(state) !== undefined` and `canDescend = isOnStairs(state)` and pushes those buttons only when true. The helpers are guarded on `state !== undefined` (state can be absent before the run loads). Other controls keep their existing conditions — in particular the ranged `Fire` control stays visible only while a ranged weapon is carried. Reusing the same helpers as the description line (D3) keeps "what is underfoot" and "which actions are offered" from drifting apart.

- **Alternatives.** (a) Leave the controls always visible and let the engine no-op: rejected — the request is to stop offering refused actions. (b) Disable instead of hide: rejected — the request says hide, and a disabled button on a small phone action bar is still clutter.

### D5 — The D-pad center cell and the `.` web key both dispatch wait

`Dpad.tsx` places a stateless `WaitButton` in the middle row between west and east, dispatching `{ type: 'wait' }` through the shared `dispatch`. `src/ui/logic/input.ts` adds `WAIT_KEYS = new Set(['.'])` (the conventional roguelike pass key) and `commandForKey` maps it to `{ type: 'wait' }`; `useKeyboardInput` already forwards any command from `commandForKey` through `dispatch`, so the key is live on web with no hook change beyond documentation.

- **The `.` key is a parity addition (assumption, recorded).** The literal request was a center wait button; the `.` key is added so the web keyboard has parity with every other on-screen command (arrows/pickup/descend already have keys), matching the existing "Keyboard input is a web-only convenience" requirement. It is additive and does not change native behavior.
- **Alternatives.** (a) Bind Space or Enter: rejected — Enter is already descend, and Space scrolls the page. (b) On-screen only: rejected — it would leave the web keyboard unable to pass a turn while every other action has a key.

## Risks / Trade-offs

- **[A wait that advances monsters could let a low-HP player die while apparently "doing nothing"]** → This is the intended roguelike semantics of a pass, and it is deterministic; the wait event is observable and the existing "turn step stops when the player dies" rule still applies.
- **[Backfill drift: the code may not exactly match these artifacts]** → The tasks are written as verifiable checks against the existing tests and behavior; apply is expected to run them and confirm, fixing any genuine mismatch rather than trusting the code.
- **[The description line could clutter the HUD on small screens]** → It renders nothing on ordinary empty tiles and is a single compact line; it is not added to the controls.
- **[Item-over-stairs precedence could surprise a player hunting the stairs]** → The existing HUD stairs direction/distance hint still guides them, and stepping off the item reveals the stairs line.
