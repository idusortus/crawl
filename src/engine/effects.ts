/**
 * Effect registry (change `content-packs-v1`, phase 5; design D8).
 *
 * A pack item declares an `effect` as *data* (a discriminated object, e.g.
 * `{ kind: 'heal', amount }` or `{ kind: 'roll-heal', min, max }`). The engine
 * resolves that data through this registry: a small, enumerated map from an
 * effect `kind` string to a **pure resolver**.
 *
 * Resolver contract:
 *
 *   `(actor, effect, rng) -> { actorAfter, applied }`
 *
 *  - `actor` is the plain-data `Entity` the effect is applied to. It is never
 *    mutated: `actorAfter` is a shallow copy with the changed field(s) replaced,
 *    so all other entity properties survive untouched.
 *  - `applied` is a plain-data record describing what happened, in a shape that
 *    is always JSON-clean. For a random effect it records the **drawn** amount
 *    rather than the range, so the emitted `item-used` event is fully
 *    informative and a replay can assert the exact roll.
 *  - `rng` is the injected seeded source. Deterministic effects ignore it;
 *    random effects must draw through it (never `Math.random`) so the same seed
 *    reproduces the same outcome (design D2/D7).
 *
 * This module is framework-free and deterministic: no react/react-native/expo,
 * no `Math.random`/`Date` (enforced by ESLint on `src/engine/**`). It adds no
 * behavior-scripting surface — packs name a kind, never supply logic (design
 * D8).
 */

import { randInt, type Rng } from './rng';
import type { Entity } from './types';
import type { ItemEffect } from './schema/pack';

/**
 * The plain-data description of an applied effect.
 *
 * `kind` mirrors the resolver's effect kind; `amount` is the HP change that was
 * actually applied (for `roll-heal`, the value drawn from the RNG — not the
 * range). Kept minimal and JSON-clean so it can travel on an event and through
 * a serialized log unchanged.
 */
export interface AppliedEffect {
  kind: string;
  amount: number;
}

/** The result of a successful effect resolution. */
export interface EffectResolution {
  /** A copy of `actor` with the effect applied. `actor` itself is untouched. */
  actorAfter: Entity;
  /** Plain-data description of what was applied (event payload). */
  applied: AppliedEffect;
}

/**
 * A pure effect resolver: given the acting entity, the declarative effect data,
 * and the injected RNG, returns the updated entity plus a plain record of what
 * happened. Implementations must not mutate `actor`.
 */
export type EffectResolver = (
  actor: Entity,
  effect: ItemEffect,
  rng: Rng,
) => EffectResolution;

/**
 * Reads the actor's current hit points.
 *
 * M1 leaves entity shape open (`Entity` has an index signature), so `hp` is not
 * a declared field. Convention: a numeric `hp` property is the actor's health;
 * anything else (missing, non-number) is treated as 0. This keeps a healless
 * entity safe to resolve without inventing state.
 */
export function actorHp(actor: Entity): number {
  const hp = actor.hp;
  return typeof hp === 'number' ? hp : 0;
}

/**
 * Returns a copy of `actor` with `hp` set to `hp`. A shallow copy preserves
 * every other entity property; `actor` is never mutated.
 */
function withHp(actor: Entity, hp: number): Entity {
  return { ...actor, hp };
}

/** Deterministic `heal`: always restores `effect.amount` (ignores the RNG). */
function resolveHeal(actor: Entity, effect: ItemEffect): EffectResolution {
  // The schema narrows `heal` to `{ kind: 'heal'; amount: number }`; the runtime
  // narrowing below is defensive for `unknown`-shaped effect data reaching the
  // registry (e.g. from a hand-edited pack) without throwing.
  const amount = effect.kind === 'heal' ? effect.amount : 0;
  return {
    actorAfter: withHp(actor, actorHp(actor) + amount),
    applied: { kind: 'heal', amount },
  };
}

/**
 * Seeded-random `roll-heal`: draws an inclusive integer in `[min, max]` from the
 * injected RNG and restores it. `applied.amount` records the drawn value so the
 * event is fully informative (design D7).
 */
function resolveRollHeal(
  actor: Entity,
  effect: ItemEffect,
  rng: Rng,
): EffectResolution {
  const min = effect.kind === 'roll-heal' ? effect.min : 0;
  const max = effect.kind === 'roll-heal' ? effect.max : 0;
  const amount = randInt(rng, min, max);
  return {
    actorAfter: withHp(actor, actorHp(actor) + amount),
    applied: { kind: 'roll-heal', amount },
  };
}

/**
 * The registry: effect `kind` -> resolver.
 *
 * A plain object (not a `Map`) is deliberate: it is data owned by the module,
 * never part of game state, and a plain object keeps lookups dependency-free and
 * trivially inspectable. Adding an effect is one entry here plus (optionally)
 * one variant in the pack schema's `itemEffectSchema` — never pack-supplied
 * code (design D8).
 */
export const effectRegistry: Record<string, EffectResolver> = {
  heal: resolveHeal,
  'roll-heal': resolveRollHeal,
};

/**
 * Resolves an effect by kind, or returns `undefined` for an unknown kind.
 *
 * An unknown kind is an explicit miss (not a throw): the command loop turns it
 * into a `noop`, consistent with M1's malformed-command handling (design D7).
 * The returned `actorAfter` is always a fresh copy; `actor` is never mutated.
 */
export function resolveEffect(
  kind: string,
  actor: Entity,
  effect: ItemEffect,
  rng: Rng,
): EffectResolution | undefined {
  const resolver = effectRegistry[kind];
  if (resolver === undefined) return undefined;
  return resolver(actor, effect, rng);
}
