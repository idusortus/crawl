/**
 * Durable save storage (change `ui-fit-and-persistence`, tasks 3.2/3.3 / design
 * D3/D4/D5).
 *
 * This is the ONLY client module that talks to `@react-native-async-storage/
 * async-storage`. Every other module stays framework-free: `save.ts` remains the
 * pure, synchronous serialization/replay boundary, and `useGame` treats this
 * module as a thin key/value store.
 *
 * The storage itself is not imported eagerly. Instead this module is built from
 * an **injected async storage adapter** — the small `AsyncStorageLike` interface
 * below — so the load/persist logic is pure enough to unit-test under the node
 * Vitest environment (which cannot resolve the native module's entry point).
 * `src/ui/logic/saveStorage.test.ts` supplies a fake in-memory adapter and never
 * imports AsyncStorage; `createAsyncStorageAdapter()` is the one function that
 * imports it, and only `useGame` calls that function.
 *
 * No `Date` and no randomness appear anywhere in this path (spec: "Persistence
 * introduces no ambient nondeterminism"): the store is a deterministic
 * string-in/string-out key/value boundary.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** The single key under which the current run's save envelope is stored. */
export const SAVE_STORAGE_KEY = 'crawl.save.v1';

/**
 * The minimal async key/value surface this module needs. Both the real
 * AsyncStorage and the test's in-memory fake satisfy it, so the load/persist
 * helpers below depend only on this structural interface — never on the native
 * module directly.
 */
export interface AsyncStorageLike {
  /** Reads a stored string, or `null` when the key is absent. */
  getItem(key: string): Promise<string | null>;
  /** Writes a string to the given key. */
  setItem(key: string, value: string): Promise<void>;
  /** Removes the given key. */
  removeItem(key: string): Promise<void>;
}

/**
 * The durable store's public surface. It is deliberately tiny so `useGame` can
 * hold it behind a synchronous hook API while the I/O stays internal.
 */
export interface SaveStorage {
  /**
   * Loads the stored save envelope. Resolves to `undefined` when no save exists
   * (the adapter reports `null`/`undefined`); rejects when the read itself
   * fails, so the caller can surface a non-fatal `saveError`.
   */
  loadSave(): Promise<string | undefined>;
  /** Persists the full save envelope string. Rejects on a write failure. */
  persistSave(value: string): Promise<void>;
  /** Removes the stored save (used when no run remains). Rejects on failure. */
  clearSave(): Promise<void>;
}

/**
 * Builds a {@link SaveStorage} over any adapter. Kept free of the native module
 * so it can be exercised with a fake adapter under node.
 */
export function createSaveStorage(adapter: AsyncStorageLike): SaveStorage {
  return {
    async loadSave(): Promise<string | undefined> {
      const stored = await adapter.getItem(SAVE_STORAGE_KEY);
      return stored === null || stored === undefined ? undefined : stored;
    },
    async persistSave(value: string): Promise<void> {
      await adapter.setItem(SAVE_STORAGE_KEY, value);
    },
    async clearSave(): Promise<void> {
      await adapter.removeItem(SAVE_STORAGE_KEY);
    },
  };
}

/**
 * Wires the real AsyncStorage into a {@link SaveStorage}. This is the only
 * function in the codebase that reaches the native module; the unit test does
 * not import it, so node never has to resolve AsyncStorage.
 */
export function createAsyncStorageAdapter(): AsyncStorageLike {
  return {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: (key) => AsyncStorage.removeItem(key),
  };
}
