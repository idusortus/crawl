import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: false,
    environment: 'node',
    // The node-env include covers only pure `.ts` UI tests under `src/ui` that
    // import no React Native (design D8); any RN-importing test (e.g. `Tile`) is
    // out of scope for this include.
    include: [
      'src/engine/**/*.test.ts',
      'src/packs/**/*.test.ts',
      'src/ui/**/*.test.ts',
    ],
  },
});
