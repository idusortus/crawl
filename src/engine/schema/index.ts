/**
 * Schema module barrel.
 *
 * The single import surface for content-pack schemas and validation inside
 * `src/engine`. Later phases re-export the public subset through `@engine`;
 * nothing outside `src/engine` should import this deep module directly.
 */

export {
  PACK_VERSION,
  classCollectionSchema,
  glyphSchema,
  itemCollectionSchema,
  itemEffectSchema,
  monsterCollectionSchema,
  packClassSchema,
  packClassStrictSchema,
  packIdentitySchema,
  packItemSchema,
  packMonsterSchema,
  packMonsterStrictSchema,
  packSchema,
  packVersionSchema,
  validatePack,
} from './pack';

export type {
  ItemEffect,
  Pack,
  PackClass,
  PackItem,
  PackMonster,
  PackValidationResult,
} from './pack';
