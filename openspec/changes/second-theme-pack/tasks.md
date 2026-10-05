# Tasks

## 1. Author the dogs content pack (data only)

- [ ] 1.1 Create `src/packs/dogs/pack.json` with `id`/`name`/`version: 2`, ≥2 dog-themed classes (positive `hp`/`attack`, one-character glyphs), ≥1 dog-themed monster (`behavior` from `{chase, idle}`, positive `hp`/`attack`, one-character glyph), and ≥1 dog-themed item (`effect` of kind `heal` or `roll-heal`, one-character glyph). Verify with `node -e "JSON.parse(require('fs').readFileSync('src/packs/dogs/pack.json','utf8'))"` and by eyeballing collection counts (classes ≥2, monsters ≥1, items ≥1).
- [ ] 1.2 Create `src/packs/dogs/index.ts` mirroring `src/packs/fantasy/index.ts`: import `./pack.json`, export `dogsPack` as the **raw** (uncast) value, export a `Pack`-typed alias for already-validated consumers, and default-export the raw value. Verify by reading the file against the fantasy entry and confirming no `as`/cast on the raw import.

## 2. Prove the pack loads and the theme is intact

- [ ] 2.1 Create `src/packs/dogs/__tests__/dogs-pack.test.ts` mirroring `fantasy-pack.test.ts`: assert `validatePack(dogsPack).ok === true`, `loadPack(dogsPack)` succeeds with the expected id, `version === PACK_VERSION`, and collection lengths meet the composition floor. Verify with `npx vitest run src/packs/dogs`.
- [ ] 2.2 Add theme/identity assertions: a known class, monster, and item resolve by id; every class/monster/item declares non-empty id/name and a one-character glyph; every class and monster has a positive `attack`; the raw JSON round-trips losslessly. Verify the dogs test passes.
- [ ] 2.3 Add vocabulary-reuse assertions: every dogs monster `behavior` is a key of the engine's exported `behaviorRegistry`, and every dogs item `effect.kind` is one the pack schema defines. Verify the dogs test passes, and reason: a failure here means the pack leaked new vocabulary into the engine and the pack must be revised, not the engine.

## 3. Verify the abstraction-leak acceptance criterion

- [ ] 3.1 Confirm `src/engine/**` is unchanged: `git status --porcelain -- src/engine` and `git diff --stat -- src/engine` are empty, and `PACK_VERSION` still reads `2` in `src/engine/schema/pack.ts`. Record the output (empty diff = pass).
- [ ] 3.2 Confirm no new registry vocabulary: reread `behaviorRegistry` in `src/engine/ai.ts` and the effect union in `src/engine/schema/pack.ts` and confirm neither gained an entry for the dogs pack. If either did, revert it — an engine edit made for this pack is a failed leak test, and the need for it is recorded as a finding instead.
- [ ] 3.3 Run the full engine gate and confirm zero regressions: `npm test`, `npm run typecheck`, `npm run lint` all exit 0, with `src/engine` purity unchanged.

## 4. Document the outcome

- [ ] 4.1 Document how to run the dogs pack: add a short note (where the project keeps pack docs, e.g. `STATE.md`/`decisions.md` or a pack README) that the app hardcodes `fantasyPack` in `src/ui/hooks/useGame.ts` and switching is a one-line import change to `dogsPack`; state that a pack picker is out of scope and would still need zero engine support. Verify the note names the exact file and line-shaped change.
- [ ] 4.2 Record the leak-test result and what "no engine changes" verification looked like (the commands from group 3 and their empty-diff outcome) in `STATE.md`, `decisions.md`, and a session entry in `agent-diary.md`. Verify each file mentions the `second-theme-pack` outcome.
