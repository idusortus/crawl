/**
 * Combat — a named damage registry (change `core-gameplay-loop`, design D2).
 *
 * This module mirrors the effect-registry pattern in `effects.ts`: a small,
 * enumerated map from a **damage kind** string to a **pure resolver**. The
 * registry is keyed on a kind id; v1 registers exactly one kind under the
 * exported constant `MELEE_DAMAGE_KIND = 'melee'`, used both at the attack call
 * site and in tests instead of a bare literal.
 *
 * Resolver contract:
 *
 *   `(attacker, target, rng) -> { targetAfter, applied }`
 *
 *  - `attacker`/`target` are the plain-data `Entity` objects involved. Neither is
 *    mutated: `targetAfter` is a shallow copy with only `hp` replaced, so every
 *    other plain property survives untouched.
 *  - `applied` is a plain-data record of the resolved hit (`kind`, `amount`,
 *    `attackerId`, `targetId`) that is always JSON-clean, so a replay can assert
 *    the exact damage without re-deriving it.
 *  - The damage amount is derived from the **attacker's copied attack value**
 *    (`attacker.attack`, a plain number written onto the entity at spawn by
 *    `populateLevel` / `createInitialState`), never a pack lookup during
 *    resolution. An entity with no copied attack falls back to the engine base
 *    constant `DEFAULT_ATTACK` (design D2).
 *  - `rng` is the injected seeded source. A resolver that adds variation draws
 *    through it (`randInt`); a fixed-damage resolver draws nothing, so a
 *    no-draw path leaves `rng.state` unchanged (design D2).
 *
 * ## Phase-4 seam (documented for Phase 5)
 *
 * This file ships the **final-shaped** damage seam now, so the AI (Phase 4) can
 * attack through it and Phase 5 can extend it without churn. Phase 5
 * (task 5.1) adds the `death` / `player-died` event factories and the
 * world-level wiring (entity removal, `status -> 'dead'`) and may register
 * additional damage kinds. It does **not** need to change the signature of
 * `resolveDamage`/`DamageResolver`/`DamageResolution` or the value of
 * `MELEE_DAMAGE_KIND` — those are frozen here. Thus `ai.ts`'s attack call site
 * (`resolveDamage(MELEE_DAMAGE_KIND, ...)`) is already final.
 *
 * This module is framework-free and deterministic: no react/react-native/expo,
 * no `Math.random`/`Date` (enforced by ESLint on `src/engine/**`).
 */

import { randInt, type Rng } from './rng';
import type { Entity } from './types';

/**
 * The v1 melee damage kind. Exported so the attack call site and tests share one
 * constant instead of a bare `'melee'` literal (design D2 / task 5.1).
 */
export const MELEE_DAMAGE_KIND = 'melee';

/**
 * The fixed base attack used when an entity carries no copied `attack` value.
 *
 * Every spawned player/monster copies its pack-declared `attack` onto the
 * entity (design D2), so this is only a defensive floor for a content-free
 * fixture. It keeps an attack resolvable rather than throwing or dealing zero.
 */
export const DEFAULT_ATTACK = 1;

/**
 * The plain-data description of a resolved hit.
 *
 * Kept minimal and JSON-clean so it can travel on an event and through a
 * serialized log unchanged: `kind` is the damage kind, `amount` the HP removed,
 * and the two ids identify the participants.
 */
export interface AppliedDamage {
  kind: string;
  amount: number;
  attackerId: string;
  targetId: string;
}

/** The result of resolving a damage kind against a target. */
export interface DamageResolution {
  /** A copy of `target` with its HP reduced. `target` itself is untouched. */
  targetAfter: Entity;
  /** Plain-data description of the hit (event payload). */
  applied: AppliedDamage;
}

/**
 * A pure damage resolver: given the attacking entity, the target entity, and the
 * injected RNG, returns the target's post-hit copy plus a plain record of what
 * happened. Implementations must not mutate either entity.
 */
export type DamageResolver = (
  attacker: Entity,
  target: Entity,
  rng: Rng,
) => DamageResolution;

/**
 * Reads an entity's current hit points.
 *
 * `Entity` has an open shape (`hp` is not a declared field), so a numeric `hp`
 * is the actor's health; anything else (missing, non-number) is treated as 0,
 * matching `actorHp` in `effects.ts`. This keeps a stat-less entity safe to
 * resolve without inventing state.
 */
export function entityHp(entity: Entity): number {
  const hp = entity.hp;
  return typeof hp === 'number' ? hp : 0;
}

/**
 * Reads the attacker's copied attack value, falling back to `DEFAULT_ATTACK`
 * when it is absent or not a positive number. A non-positive declared attack is
 * treated as the fallback rather than a zero-damage hit, so an authored value of
 * `0` cannot produce a "hit" that does nothing.
 */
function attackOf(attacker: Entity): number {
  const attack = attacker.attack;
  return typeof attack === 'number' && attack > 0 ? attack : DEFAULT_ATTACK;
}

/** Returns a copy of `target` with `hp` set; `target` is never mutated. */
function withHp(target: Entity, hp: number): Entity {
  return { ...target, hp };
}

/**
 * The v1 melee resolver: damage is the attacker's copied attack value, drawn as
 * an inclusive integer in `[1, attack]` from the injected seeded source. The
 * draw is deliberate (a `randInt` happens even when `attack === 1`, where the
 * range collapses to a single value) so an attack is always a seeded event and
 * replay reproducibility is exercised rather than trivially satisfied.
 *
 * `amount = randInt(rng, 1, attack)`. The target's HP is reduced by `amount`; it
 * may go to zero or below, which is what lets the world layer detect death
 * (Phase 5).
 */
function resolveMelee(
  attacker: Entity,
  target: Entity,
  rng: Rng,
): DamageResolution {
  const attack = attackOf(attacker);
  const amount = randInt(rng, 1, attack);
  const targetAfter = withHp(target, entityHp(target) - amount);
  return {
    targetAfter,
    applied: {
      kind: MELEE_DAMAGE_KIND,
      amount,
      attackerId: attacker.id,
      targetId: target.id,
    },
  };
}

/**
 * The registry: damage kind -> resolver.
 *
 * A plain object (not a `Map`) is deliberate: it is data owned by the module,
 * never part of game state, and a plain object keeps lookups dependency-free and
 * trivially inspectable. Adding a kind is one entry here — never pack-supplied
 * code (design D2).
 */
export const damageRegistry: Record<string, DamageResolver> = {
  [MELEE_DAMAGE_KIND]: resolveMelee,
};

/**
 * Resolves a damage kind against `target`, or returns `undefined` for an
 * unknown kind.
 *
 * An unknown kind is an explicit miss (not a throw): callers degrade to a noop
 * or skip the attack, consistent with `resolveEffect` and M1's malformed-command
 * handling. The returned `targetAfter` is always a fresh copy; neither entity is
 * mutated.
 */
export function resolveDamage(
  kind: string,
  attacker: Entity,
  target: Entity,
  rng: Rng,
): DamageResolution | undefined {
  const resolver = damageRegistry[kind];
  if (resolver === undefined) return undefined;
  return resolver(attacker, target, rng);
}
