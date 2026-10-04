/**
 * `GameProvider` — the React context wrapper around `useGame` (change
 * `expo-glyph-renderer`, design D4/D7; task 2.3).
 *
 * Exposes `{ state, pack, dispatch, error }` to the tree via a typed context.
 * The context value is produced by `useGame`, so the command-dispatch contract
 * and the one-time pack load live in exactly one place (`useGame`). Components
 * consume it with `useGameContext()`, which throws if no provider is present —
 * a missing provider is a programming error, not a recoverable runtime state.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { useGame } from '../hooks/useGame';
import type { UseGameResult } from '../hooks/useGame';

/**
 * The context value is exactly what `useGame` returns, so the hook and the
 * context cannot drift. It starts `undefined` only to detect a missing provider.
 */
const GameContext = createContext<UseGameResult | undefined>(undefined);

/** Props for {@link GameProvider}. */
export interface GameProviderProps {
  children: ReactNode;
  /** Optional run seed; defaults to `useGame`'s default. */
  seed?: number;
}

/** Provides game state + dispatch to the subtree. */
export function GameProvider({ children, seed }: GameProviderProps) {
  const game = useGame(seed);
  return <GameContext.Provider value={game}>{children}</GameContext.Provider>;
}

/**
 * Reads the game context. Throws when called outside a {@link GameProvider},
 * which surfaces the mistake immediately rather than returning `undefined` and
 * failing later at a call site.
 */
export function useGameContext(): UseGameResult {
  const value = useContext(GameContext);
  if (value === undefined) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return value;
}
