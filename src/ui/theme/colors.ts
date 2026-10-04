/**
 * Color tokens for the glyph renderer (change `expo-glyph-renderer`, design
 * D6; task 3.1).
 *
 * Deliberately framework-free: this module imports nothing from React or React
 * Native, so the visibility/glyph logic in `src/ui/logic` can consume it under
 * the node test environment. Every token is a plain hex string.
 *
 * The three visibility treatments are ordered by prominence and mirror the
 * engine's visibility model exactly (design D5): a tile is either currently
 * `visible`, previously seen but not now (`explored`, dimmed so the player can
 * remember it), or never seen (`unseen`, rendered as background only — it must
 * reveal nothing about the terrain or any occupant).
 */

/** Color tokens for the renderer. Plain hex strings, no framework import. */
export interface ThemeColors {
  /** Bright foreground for tiles currently in FOV. */
  visible: string;
  /** Dim foreground for remembered-but-not-currently-visible tiles. */
  explored: string;
  /** Background for never-seen tiles (no glyph is drawn). */
  unseen: string;
  /** Background for seen tiles; contrasts against the glyphs. */
  background: string;
  /** Player entity accent (also used to distinguish the player). */
  player: string;
  /** Terrain accent shared by all entities drawn over terrain. */
  entity: string;
  /** Wall glyph/foreground color. */
  wall: string;
  /** Floor glyph/foreground color. */
  floor: string;
}

/** The single palette used by the v1 renderer. */
export const colors: ThemeColors = {
  visible: '#f5f5f5',
  explored: '#6b7280',
  unseen: '#0b0f14',
  background: '#111827',
  player: '#fbbf24',
  entity: '#f87171',
  wall: '#9ca3af',
  floor: '#374151',
};
