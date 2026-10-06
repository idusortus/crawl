/**
 * Pure hold-repeat stop predicate for the on-screen D-pad (change
 * `travel-and-repeat-move`, design D6; post-apply review Fix 3).
 *
 * Framework-free — no React, no React Native — so it is unit-testable under the
 * node Vitest environment, unlike `Dpad.tsx` which imports react-native. It
 * imports only the `@engine` public barrel.
 *
 * `Dpad` dispatches the first step on press-in and then repeats the move on a
 * fixed cadence; after each step it asks this predicate whether the repeat must
 * end. Keeping the decision here (rather than inline in the component) is what
 * makes "blocked ⇒ stop, moved ⇒ continue, bump-to-attack ⇒ continue, terminal
 * ⇒ stop" assertable without a renderer.
 */

import type { CommandResult } from '@engine';

/**
 * Decides whether a dispatched `move` step must end a hold-repeat (design D6).
 *
 * The engine's `blocked` event is the authoritative refusal. The fallback is a
 * step that neither moved the player nor struck a target — i.e. the player's
 * tile did not change. A bump-to-attack also leaves the player on the same tile,
 * so it is explicitly *not* treated as a refusal: the repeat continues while the
 * held direction keeps landing on a living occupant. A terminal run (or a
 * missing result, meaning no run is loaded) also stops the repeat.
 */
export function stepStopsRepeat(result: CommandResult | undefined): boolean {
  if (result === undefined) return true;
  if (result.state.status === 'dead') return true;
  const blocked = result.events.some((event) => event.type === 'blocked');
  const moved = result.events.some((event) => event.type === 'moved');
  const struck = result.events.some((event) => event.type === 'attacked');
  return blocked || (!moved && !struck);
}
