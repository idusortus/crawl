/**
 * Pure unit tests for the durable save store (change `ui-fit-and-persistence`,
 * tasks 3.2/3.3 / design D3/D5).
 *
 * These run under the node Vitest environment and use a fake in-memory adapter.
 * They MUST NOT import `@react-native-async-storage/async-storage` — node cannot
 * resolve the native module, and `createSaveStorage` is deliberately built to
 * accept an injected adapter so the logic is testable without it.
 */

import { describe, expect, it } from 'vitest';

import { createSaveStorage, SAVE_STORAGE_KEY } from './saveStorage';
import type { AsyncStorageLike } from './saveStorage';

/**
 * A fake async key/value store mirroring AsyncStorage's string/null contract,
 * with optional forced read/write failures.
 */
function createFakeAdapter(options?: {
  /** Makes every `getItem` reject, to exercise the surfaced load error. */
  failRead?: boolean;
  /** Makes every `setItem` reject, to exercise the surfaced write error. */
  failWrite?: boolean;
}): { adapter: AsyncStorageLike; store: Map<string, string> } {
  const store = new Map<string, string>();
  const { failRead = false, failWrite = false } = options ?? {};
  const adapter: AsyncStorageLike = {
    async getItem(key) {
      if (failRead) throw new Error('read failed');
      return store.has(key) ? (store.get(key) as string) : null;
    },
    async setItem(key, value) {
      if (failWrite) throw new Error('write failed');
      store.set(key, value);
    },
    async removeItem(key) {
      store.delete(key);
    },
  };
  return { adapter, store };
}

describe('createSaveStorage', () => {
  it('loads undefined when no save is present', async () => {
    const { adapter } = createFakeAdapter();
    const storage = createSaveStorage(adapter);

    await expect(storage.loadSave()).resolves.toBeUndefined();
  });

  it('surfaces a load error instead of swallowing it', async () => {
    const { adapter } = createFakeAdapter({ failRead: true });
    const storage = createSaveStorage(adapter);

    await expect(storage.loadSave()).rejects.toThrow('read failed');
  });

  it('round-trips a persisted save', async () => {
    const { adapter, store } = createFakeAdapter();
    const storage = createSaveStorage(adapter);

    await storage.persistSave('envelope');
    await expect(storage.loadSave()).resolves.toBe('envelope');
    // The value lands under the single documented key.
    expect(store.get(SAVE_STORAGE_KEY)).toBe('envelope');
  });

  it('surfaces a persist error instead of swallowing it', async () => {
    const { adapter } = createFakeAdapter({ failWrite: true });
    const storage = createSaveStorage(adapter);

    await expect(storage.persistSave('envelope')).rejects.toThrow('write failed');
  });

  it('clears a stored save', async () => {
    const { adapter, store } = createFakeAdapter();
    const storage = createSaveStorage(adapter);

    await storage.persistSave('envelope');
    await storage.clearSave();

    await expect(storage.loadSave()).resolves.toBeUndefined();
    expect(store.has(SAVE_STORAGE_KEY)).toBe(false);
  });
});
