/**
 * Content-pack schema (zod as source of truth — design D2/D3).
 *
 * A pack is pure declarative data: identity + three entry collections
 * (classes, monsters, items) plus a render glyph and stats per entry. Items
 * carry at least one of a discriminated-union `effect` (used) or a `ranged`
 * weapon descriptor (fired); both are *data, not code*, so packs are
 * serializable and theme-agnostic (design D3/D8).
 *
 * `zod` schemas are the single source of truth; the exported `Pack`/`PackClass`/
 * `PackMonster`/`PackItem`/`ItemEffect` types are inferred from them via
 * `z.infer`, so the runtime validator and the compile-time type cannot drift.
 *
 * This module must stay framework-free and deterministic (no react/react-native/
 * expo imports, no `Math.random`/`Date`), per the `src/engine` boundary rules.
 */

import { z } from 'zod';

/** The only pack schema version this engine understands (design D4/D9). */
export const PACK_VERSION = 2;

/**
 * A render glyph: exactly one character. The `z.string()` guard first produces
 * a clean "expected string" issue for non-strings; the `.refine` then rejects
 * multi-character strings with a precise message the pack author can act on.
 */
export const glyphSchema = z
  .string()
  .refine((value) => value.length === 1, {
    message: 'glyph must be exactly one character',
  });

/**
 * The pack schema version: a number narrowed to exactly `PACK_VERSION`.
 *
 * Declared as `z.number().refine(...)` rather than `z.literal(PACK_VERSION)` so
 * the failure message can *name the received version* (spec: "validation fails
 * with a message naming the unsupported version"), which `z.literal`'s stock
 * message cannot do. The `as` cast preserves the inferred type as the literal
 * `1`, so nothing downstream sees a widened `number`.
 */
export const packVersionSchema = z
  .number()
  .superRefine((value, ctx) => {
    if (value !== PACK_VERSION) {
      ctx.addIssue({
        code: 'custom',
        message: `unsupported pack version ${value}; this engine supports version ${PACK_VERSION}`,
      });
    }
  })
  .transform((value) => value as typeof PACK_VERSION);

/** A pack identity: non-empty id + name, and exactly the supported version. */
export const packIdentitySchema = z.object({
  id: z.string().min(1, 'id must be a non-empty string'),
  name: z.string().min(1, 'name must be a non-empty string'),
  version: packVersionSchema,
});

/**
 * A playable class. `hp` is a required stat so "missing required stat" is
 * testable; `attack` is the damage source the engine copies onto the player
 * entity at spawn (design D2/D9); `description` is optional display text.
 */
export const packClassSchema = z.object({
  id: z.string().min(1, 'id must be a non-empty string'),
  name: z.string().min(1, 'name must be a non-empty string'),
  glyph: glyphSchema,
  hp: z.number(),
  attack: z.number(),
  description: z.string().optional(),
});

/**
 * A class's `hp` and `attack` are required, but zero/negative values are almost
 * certainly authoring mistakes. Kept as positive numbers rather than merely
 * numbers so the schema catches obviously-invalid stats. (No upper bound —
 * content owns balance.)
 */
export const packClassStrictSchema = packClassSchema.extend({
  hp: z.number().positive('hp must be a positive number'),
  attack: z.number().positive('attack must be a positive number'),
});

/**
 * A monster entry: stable id, display name, glyph, required health, a named
 * `behavior` id the engine resolves through `behaviorRegistry` (never
 * pack-supplied code), and an `attack` value copied onto the entity at spawn
 * (design D2/D3/D9).
 */
export const packMonsterSchema = z.object({
  id: z.string().min(1, 'id must be a non-empty string'),
  name: z.string().min(1, 'name must be a non-empty string'),
  glyph: glyphSchema,
  hp: z.number(),
  behavior: z.string().min(1, 'behavior must be a non-empty string'),
  attack: z.number(),
  description: z.string().optional(),
});

/** A monster's `hp` and `attack` must be positive (see class note above). */
export const packMonsterStrictSchema = packMonsterSchema.extend({
  hp: z.number().positive('hp must be a positive number'),
  attack: z.number().positive('attack must be a positive number'),
});

/**
 * Declarative item effects: a discriminated union of plain data (design D3/D8).
 *
 * - `heal`: deterministic — always restores `amount`.
 * - `roll-heal`: seeded-random — restores a value in `[min, max]` drawn from the
 *   injected RNG.
 *
 * Kinds are named ids the engine resolves via its effect registry; packs never
 * embed functions, so effects stay serializable and theme-agnostic.
 */
export const itemEffectSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('heal'),
    amount: z.number().positive('amount must be a positive number'),
  }),
  z
    .object({
      kind: z.literal('roll-heal'),
      min: z.number().int(),
      max: z.number().int(),
    })
    // A reversed range silently collapses to `min`, hiding an authoring bug, so
    // reject it with a message that names the constraint.
    .refine((effect) => effect.max >= effect.min, {
      message: 'roll-heal max must be >= min',
      path: ['max'],
    }),
]);

/**
 * A ranged-weapon descriptor: plain declarative data (design D3).
 *
 * - `range`: how far the weapon can reach, a positive integer measured in tiles
 *   (the engine gates shots on Chebyshev distance).
 * - `damage`: the weapon's attack value, a positive number.
 *
 * Kept as data — packs never embed behavior (design D3/D8).
 */
export const rangedDescriptorSchema = z.object({
  range: z.number().int().positive('range must be a positive integer'),
  damage: z.number().positive('damage must be a positive number'),
});

/**
 * An item entry: id, name, glyph, and **at least one** of a consumable
 * declarative `effect` or a `ranged` weapon descriptor (design D3/D8).
 *
 * `effect` and `ranged` are each optional so an item can be a weapon that is
 * fired rather than used; the refinement rejects an item declaring neither, so
 * no entry is inert. The refinement's path points at `effect` and its message
 * names both fields, so a pack author sees exactly what is missing.
 */
export const packItemSchema = z
  .object({
    id: z.string().min(1, 'id must be a non-empty string'),
    name: z.string().min(1, 'name must be a non-empty string'),
    glyph: glyphSchema,
    effect: itemEffectSchema.optional(),
    ranged: rangedDescriptorSchema.optional(),
    description: z.string().optional(),
  })
  .refine((item) => item.effect !== undefined || item.ranged !== undefined, {
    message: 'item must declare at least one of effect or ranged',
    path: ['effect'],
  });

/**
 * Reject duplicate ids within a single collection, naming the duplicated id and
 * pointing at the offending entry's `id` field (design D10; spec: "Duplicate
 * ids within a collection are rejected").
 */
function uniqueById<TSchema extends z.ZodType<{ id: string }>>(
  entrySchema: TSchema,
  collectionName: string,
): z.ZodType<z.infer<TSchema>[], z.infer<TSchema>[]> {
  return z.array(entrySchema).superRefine((entries, ctx) => {
    const seen = new Set<string>();
    entries.forEach((entry, index) => {
      if (seen.has(entry.id)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: `duplicate ${collectionName} id "${entry.id}"`,
        });
      }
      seen.add(entry.id);
    });
  }) as z.ZodType<z.infer<TSchema>[], z.infer<TSchema>[]>;
}

/** Classes: unique-id collection of the strict entry schema. */
export const classCollectionSchema = uniqueById(
  packClassStrictSchema,
  'class',
);

/** Monsters: unique-id collection of the strict entry schema. */
export const monsterCollectionSchema = uniqueById(
  packMonsterStrictSchema,
  'monster',
);

/** Items: unique-id collection of the item schema. */
export const itemCollectionSchema = uniqueById(packItemSchema, 'item');

/**
 * The complete pack schema.
 *
 * Collections may be empty at the schema layer; the "at least two classes /
 * one monster / one item" requirement from the spec is a loader/engine policy
 * (spec deltas are enforced where they belong, and the loader owns "a usable
 * pack"). Keeping the schema permissive on counts lets the schema be reused for
 * partial fixtures while the loader enforces the composition floor.
 */
export const packSchema = packIdentitySchema.extend({
  classes: classCollectionSchema,
  monsters: monsterCollectionSchema,
  items: itemCollectionSchema,
});

/** A validated content pack (identity + collections). Inferred from zod. */
export type Pack = z.infer<typeof packSchema>;

/** A playable class entry. Inferred from zod. */
export type PackClass = z.infer<typeof packClassStrictSchema>;

/** A monster entry. Inferred from zod. */
export type PackMonster = z.infer<typeof packMonsterStrictSchema>;

/** An item entry. Inferred from zod. */
export type PackItem = z.infer<typeof packItemSchema>;

/** A declarative item effect (discriminated union of plain data). */
export type ItemEffect = z.infer<typeof itemEffectSchema>;

/** A declarative ranged-weapon descriptor (`{ range, damage }`). */
export type RangedDescriptor = z.infer<typeof rangedDescriptorSchema>;

/** Result of a non-throwing pack validation (design D2/D5). */
export type PackValidationResult =
  | { ok: true; pack: Pack }
  | { ok: false; error: string };

/**
 * Format a zod issue list into a readable, path-bearing message such as
 * `classes[1].id: duplicate class id "goblin"`. Paths are joined with `.` and
 * array indices are bracketed so a pack author can jump straight to the field.
 */
function formatIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.reduce<string>((acc, segment) => {
        if (typeof segment === 'number') {
          return `${acc}[${segment}]`;
        }
        return acc.length === 0 ? String(segment) : `${acc}.${String(segment)}`;
      }, '');
      const location = path.length > 0 ? path : '<root>';
      return `${location}: ${issue.message}`;
    })
    .join('; ');
}

/**
 * Validate unknown input as a content pack without throwing (design D5).
 *
 * Returns a discriminated result so the loader (next phase) decides policy:
 * `{ ok: true, pack }` on success, or `{ ok: false, error }` with an
 * actionable, path-bearing message. Never throws — a thrown zod error would
 * force every caller to wrap in try/catch.
 */
export function validatePack(input: unknown): PackValidationResult {
  const result = packSchema.safeParse(input);
  if (result.success) {
    return { ok: true, pack: result.data };
  }
  return { ok: false, error: formatIssues(result.error.issues) };
}
