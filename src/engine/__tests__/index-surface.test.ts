import { describe, it, expect } from 'vitest';
// Task 4.4: nothing outside `src/engine` should reach deeper than `index.ts`.
// This test imports ONLY from the public surface (via the `@engine` alias) to
// prove the barrel re-exports everything the full flow needs.
import {
  actorHp,
  advanceMonsters,
  appendEvents,
  applyCommand,
  applyCommandWithPack,
  attacked,
  behaviorRegistry,
  blocked,
  computeFov,
  createGrid,
  createRng,
  damageRegistry,
  death,
  DEFAULT_ATTACK,
  DEFAULT_GENERATOR_ID,
  DEFAULT_SIGHT_RADIUS,
  deserializeSave,
  effectRegistry,
  entityAt,
  entityById,
  entityHp,
  exploreInto,
  generateBspLevel,
  generateLevel,
  generatorIds,
  inBounds,
  isPassable,
  itemUsed,
  levelChanged,
  loadPack,
  MELEE_DAMAGE_KIND,
  MIN_CLASSES,
  MIN_ITEMS,
  MIN_MONSTERS,
  moved,
  noop,
  PACK_VERSION,
  playerDied,
  populateLevel,
  randInt,
  resolveDamage,
  resolveBehavior,
  resolveEffect,
  resumeRun,
  rngFromState,
  rngToState,
  SAVE_VERSION,
  serializeSave,
  UnknownContentIdError,
  UnknownGeneratorIdError,
  UnknownSaveVersionError,
  validatePack,
} from '@engine/index';
import type {
  AppliedEffect,
  AttackCommand,
  AttackedEvent,
  BlockedEvent,
  Command,
  ContentCollection,
  DeathEvent,
  DescendCommand,
  Direction,
  EffectResolution,
  EffectResolver,
  Entity,
  GameEvent,
  GameState,
  GeneratedLevel,
  GenerateLevelInput,
  Grid,
  ItemEffect,
  ItemPickedUpEvent,
  ItemUsedEvent,
  LevelChangedEvent,
  LevelGenerator,
  LevelGeneratorOptions,
  LevelPopulation,
  LoadedPack,
  MovedEvent,
  MoveCommand,
  NoopEvent,
  Pack,
  PackClass,
  PackItem,
  PickupCommand,
  PlayerDiedEvent,
  PackMonster,
  PackValidationResult,
  Position,
  Rng,
  RngState,
  SaveEnvelope,
  UseItemCommand,
} from '@engine/index';

// The fantasy pack lives OUTSIDE `src/engine` and is imported directly from its
// module — that is allowed; the point of this test is that the *engine symbols*
// all come through the public barrel.
import { fantasyPack } from '../../packs/fantasy';

describe('public engine surface (@engine)', () => {
  it('exposes the full command→event→state→serialize flow', () => {
    const grid: Grid = createGrid([
      [true, true],
      [true, false],
    ]);
    const rng: Rng = createRng(7);
    const player: Entity = { id: 'player', kind: 'player', pos: { x: 0, y: 0 } };
    const state: GameState = {
      grid,
      level: { depth: 1, spawn: { x: 0, y: 0 }, stairs: { x: 1, y: 0 } },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [player],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: rngToState(7, rng),
      events: [],
    };

    expect(inBounds(grid, { x: 0, y: 0 })).toBe(true);
    expect(isPassable(grid, { x: 1, y: 1 })).toBe(false);
    expect(entityAt(state.entities, { x: 0, y: 0 })?.id).toBe('player');
    expect(entityById(state.entities, 'player')?.kind).toBe('player');

    const command: Command = { type: 'move', direction: 'east' };
    const result = applyCommand(state, command, rngFromState(state.rng));

    const ev: GameEvent = result.events[0];
    expect(ev.type).toBe('moved');
    expect(result.state.entities[0].pos).toEqual({ x: 1, y: 0 });
    expect(result.state.events).toHaveLength(1);
  });

  it('re-exports the event constructors and log helper', () => {
    const m: MovedEvent = moved('p', { x: 0, y: 0 }, { x: 1, y: 0 });
    const b: BlockedEvent = blocked('p', 'east');
    const n: NoopEvent = noop('r');
    const log: GameEvent[] = appendEvents([], [m, b, n]);
    expect(log.map((e) => e.type)).toEqual(['moved', 'blocked', 'noop']);
  });

  it('re-exports the RNG helpers (types + bounded draw)', () => {
    const draw = (rng: Rng): number => randInt(rng, 0, 9);
    const saved: RngState = rngToState(3, createRng(3));
    const restored: Rng = rngFromState(saved);
    expect(draw(createRng(3))).toBe(draw(restored));
    const command: MoveCommand = { type: 'move', direction: 'north' as Direction };
    expect(command.type).toBe('move');
    const pos: Position = { x: 0, y: 0 };
    expect(pos.y).toBe(0);
  });

  // Task 6.1: the full content-driven flow must be reachable through the barrel
  // alone. `loadPack` -> resolved ids -> `applyCommandWithPack(use-item)` ->
  // `item-used` event with the heal applied. Every engine symbol here is
  // imported from `@engine/index`; only the pack data comes from `src/packs`.
  it('runs a full content-driven flow through the public surface', () => {
    const pack: LoadedPack = loadPack(fantasyPack);

    // Loader surface: identity, id lookup, and the composition-floor constants.
    const loaded: Pack = pack.pack;
    expect(loaded.id).toBe('fantasy');
    expect(loaded.version).toBe(PACK_VERSION);
    expect(MIN_CLASSES).toBe(2);
    expect(MIN_MONSTERS).toBe(1);
    expect(MIN_ITEMS).toBe(1);

    const cls: PackClass = pack.class('fighter');
    const monster: PackMonster = pack.monster('goblin');
    const item: PackItem = pack.item('healing-potion');
    expect(cls.hp).toBe(14);
    expect(cls.attack).toBe(4);
    expect(monster.id).toBe('goblin');
    expect(monster.behavior).toBe('chase');
    expect(monster.attack).toBe(2);
    expect(item.effect).toEqual({ kind: 'heal', amount: 8 });

    // Schema surface: a non-throwing validation result.
    const validation: PackValidationResult = validatePack(fantasyPack);
    expect(validation.ok).toBe(true);

    // Effect-registry surface: the item's effect kind is registered.
    const effect: ItemEffect = item.effect;
    const resolver: EffectResolver | undefined = effectRegistry[effect.kind];
    expect(typeof resolver).toBe('function');

    // Build a state whose actor carries hp, then resolve the item by id.
    const grid: Grid = createGrid([
      [true, true],
      [true, false],
    ]);
    const rng = createRng(42);
    const player: Entity = {
      id: 'player',
      kind: 'fighter',
      pos: { x: 0, y: 0 },
      hp: 5,
    };
    const state: GameState = {
      grid,
      level: { depth: 1, spawn: { x: 0, y: 0 }, stairs: { x: 1, y: 0 } },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [player],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: rngToState(42, rng),
      events: [],
    };

    const command: UseItemCommand = {
      type: 'use-item',
      itemId: 'healing-potion',
    };
    const { state: after, events } = applyCommandWithPack(
      state,
      command,
      rngFromState(state.rng),
      pack,
    );

    const event = events[0];
    expect(event.type).toBe('item-used');
    if (event.type !== 'item-used') return;

    const used: ItemUsedEvent = event;
    expect(used.actorId).toBe('player');
    expect(used.itemId).toBe('healing-potion');
    const applied: AppliedEffect = used.effect;
    expect(applied).toEqual({ kind: 'heal', amount: 8 });

    // The heal was applied and the event is in the log; deterministic heal does
    // not advance the RNG.
    expect(actorHp(after.entities[0])).toBe(13);
    expect(after.events).toEqual([itemUsed('player', 'healing-potion', applied)]);
    expect(after.rng).toEqual(state.rng);

    // A direct effect resolution through the barrel matches too.
    const direct: EffectResolution | undefined = resolveEffect(
      effect.kind,
      player,
      effect,
      createRng(42),
    );
    expect(direct?.applied).toEqual(applied);

    // Unknown-id reporting is part of the public surface.
    const collection: ContentCollection = 'item';
    expect(collection).toBe('item');
    expect(() => pack.item('nope')).toThrow(UnknownContentIdError);
  });
});

// Stage 3 (task 5.1): the level/FOV/descend flow must be reachable through the
// barrel alone. This test imports ONLY from `@engine/index` (no deeper module)
// and runs: generate a level -> computeFov + exploreInto to seed explored ->
// build a GameState -> apply a `descend` command -> assert `level-changed` and
// depth+1. A missing re-export for any of these symbols fails the build.
describe('public engine surface — levelgen + FOV + descend (@engine)', () => {
  it('generates a level, seeds explored via FOV, and descends through the barrel', () => {
    // --- Generator registry seam (D3) -------------------------------------
    expect(DEFAULT_GENERATOR_ID).toBe('bsp');
    expect(generatorIds()).toContain('bsp');

    // Both the registry entry point and the BSP generator directly.
    const rng: Rng = createRng(1234);
    const options: LevelGeneratorOptions = { width: 40, height: 30, depth: 1 };
    const input: GenerateLevelInput = { ...options, rng, id: 'bsp' };
    const generated: GeneratedLevel = generateLevel(input);
    // A fresh RNG at the same seed reproduces the same level (determinism), and
    // the direct generator agrees with the registry dispatch.
    const direct: GeneratedLevel = generateBspLevel(createRng(1234), options);
    expect(generated).toEqual(direct);

    // The unknown-id path is loud and typed, part of the public surface.
    expect(() => generateLevel({ ...options, rng, id: 'nope' })).toThrow(
      UnknownGeneratorIdError,
    );

    // The BSP generator type is assignable through the barrel (compile check).
    const generator: LevelGenerator = generateBspLevel;
    expect(typeof generator).toBe('function');

    // --- FOV + explored (D4/D5) ------------------------------------------
    expect(DEFAULT_SIGHT_RADIUS).toBe(8);
    const { grid, level } = generated;
    const spawnFov: boolean[] = computeFov(grid, level.spawn, DEFAULT_SIGHT_RADIUS);
    expect(spawnFov).toHaveLength(grid.width * grid.height);
    // The spawn tile is always visible from itself.
    expect(spawnFov[level.spawn.y * grid.width + level.spawn.x]).toBe(true);

    const explored: boolean[] = exploreInto(
      new Array<boolean>(grid.width * grid.height).fill(false),
      spawnFov,
    );
    expect(explored).toEqual(spawnFov);

    // --- Build a GameState from the generated level -----------------------
    // The player must stand on the stairs to satisfy the Phase-7 descend gate;
    // placement on the stairs (rather than the spawn) exercises a successful
    // descend without changing what the engine generates.
    const player: Entity = { id: 'player', kind: 'player', pos: level.stairs };
    const state: GameState = {
      grid,
      level,
      explored,
      entities: [player],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: rngToState(1234, rng),
      events: [],
    };

    // --- Descend through the public command loop --------------------------
    const command: DescendCommand = { type: 'descend' };
    const result = applyCommand(state, command, rngFromState(state.rng));

    const event: GameEvent = result.events[0];
    expect(event.type).toBe('level-changed');
    if (event.type !== 'level-changed') return;

    const changed: LevelChangedEvent = event;
    expect(changed.depth).toBe(2);
    expect(changed).toEqual(levelChanged(2));

    // Depth advanced by one and the player stands on the new spawn.
    expect(result.state.level.depth).toBe(2);
    expect(result.state.grid).not.toBe(grid);
    expect(result.state.entities[0].pos).toEqual(result.state.level.spawn);
    // Explored was rebuilt for the new level (correct length, spawn visible).
    expect(result.state.explored).toHaveLength(
      result.state.grid.width * result.state.grid.height,
    );
    const newIndex =
      result.state.level.spawn.y * result.state.grid.width + result.state.level.spawn.x;
    expect(result.state.explored[newIndex]).toBe(true);
    // Input state is never mutated.
    expect(state.level.depth).toBe(1);
  });

  // Task 5.2/5.3: the attack command, the combat registry, and the AI advance
  // step are all reachable through the barrel alone.
  it('exposes the Phase-5 attack/combat/AI surface', () => {
    const grid: Grid = createGrid([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
    const rng = createRng(7);
    const state: GameState = {
      grid,
      level: { depth: 1, spawn: { x: 0, y: 0 }, stairs: { x: 2, y: 2 } },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [
        { id: 'player', kind: 'fighter', pos: { x: 0, y: 0 }, hp: 10, attack: 4 },
        { id: 'goblin', kind: 'goblin', pos: { x: 1, y: 0 }, hp: 5, behavior: 'chase', attack: 2 },
      ],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: rngToState(7, rng),
      events: [],
    };

    // Types exist and are usable from the barrel.
    const attack: AttackCommand = { type: 'attack', direction: 'east' };
    const d: DeathEvent = death('goblin');
    const pd: PlayerDiedEvent = playerDied();
    expect(d.type).toBe('death');
    expect(pd.type).toBe('player-died');

    // The explicit attack resolves and emits the final-shaped `attacked` event.
    const result = applyCommand(state, attack, rngFromState(state.rng));
    const ev: GameEvent = result.events[0];
    expect(ev.type).toBe('attacked');
    if (ev.type === 'attacked') {
      expect(ev).toEqual(attacked('player', 'goblin', ev.amount, MELEE_DAMAGE_KIND));
    }

    // The damage + AI registries are exposed.
    expect(typeof damageRegistry[MELEE_DAMAGE_KIND]).toBe('function');
    expect(DEFAULT_ATTACK).toBe(1);
    expect(entityHp({ id: 'x', kind: 'x', pos: { x: 0, y: 0 }, hp: 3 })).toBe(3);
    const resolution = resolveDamage(
      MELEE_DAMAGE_KIND,
      state.entities[0],
      state.entities[1],
      createRng(1),
    );
    expect(resolution?.applied.kind).toBe(MELEE_DAMAGE_KIND);

    expect(typeof behaviorRegistry.chase).toBe('function');
    expect(typeof resolveBehavior('nope')).toBe('function');
    const step = advanceMonsters(state, createRng(1));
    expect(Array.isArray(step.entities)).toBe(true);
  });
});

// Task 8.2: the save/load surface must be reachable through the barrel alone,
// with `pickup`/`attack` commands and `populateLevel` exercised alongside it.
describe('public engine surface — save/load (@engine)', () => {
  it('round-trips a save and resumes it through the public surface', () => {
    const pack: LoadedPack = loadPack(fantasyPack);

    const grid: Grid = createGrid([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
    const rng = createRng(99);
    const player: Entity = {
      id: 'player',
      kind: 'fighter',
      pos: { x: 0, y: 0 },
      hp: 14,
      attack: 4,
    };
    const state: GameState = {
      grid,
      level: { depth: 1, spawn: { x: 0, y: 0 }, stairs: { x: 2, y: 2 } },
      explored: new Array<boolean>(grid.width * grid.height).fill(false),
      entities: [player, { id: 'item-0', kind: 'healing-potion', pos: { x: 0, y: 0 }, item: true }],
      playerId: 'player',
      status: 'playing',
      carriedItemIds: [],
      rng: rngToState(99, rng),
      events: [],
    };

    // The `pickup` command + its event are on the public surface.
    const pickup: PickupCommand = { type: 'pickup' };
    const picked = applyCommand(state, pickup, rngFromState(state.rng));
    expect(picked.events[0].type).toBe('item-picked-up');
    const pickedEvent = picked.events[0] as ItemPickedUpEvent;
    expect(pickedEvent.itemId).toBe('healing-potion');
    expect(picked.state.carriedItemIds).toEqual(['healing-potion']);

    // The save surface: SAVE_VERSION is separate/exported; round-trip + resume.
    expect(SAVE_VERSION).toBe(1);
    const log: Command[] = [pickup];
    const json = serializeSave(picked.state, log, log.length);

    const envelope: SaveEnvelope = deserializeSave(json);
    expect(envelope.version).toBe(SAVE_VERSION);
    expect(envelope.appliedCount).toBe(log.length);

    const resumed: GameState = resumeRun(json);
    expect(resumed).toEqual(picked.state);

    // An unknown save version is rejected loudly through the barrel.
    const bad = JSON.parse(json) as { version: number };
    bad.version = 42;
    expect(() => resumeRun(JSON.stringify(bad))).toThrow(UnknownSaveVersionError);

    // `populateLevel` + `LevelPopulation` are exported and usable.
    const generated: GeneratedLevel = generateLevel({
      rng: createRng(5),
      width: 40,
      height: 30,
      depth: 1,
    });
    const population: LevelPopulation = populateLevel(generated, pack, createRng(5));
    expect(Array.isArray(population.entities)).toBe(true);

    // The final-shaped `attacked` event type is exported.
    const hit: AttackedEvent = attacked('player', 'goblin', 2, MELEE_DAMAGE_KIND);
    expect(hit.type).toBe('attacked');
  });
});
