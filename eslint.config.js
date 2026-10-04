// ESLint 9 flat config.
//
// Two responsibilities:
//   1. Expo's recommended rules for the app (extends `eslint-config-expo/flat`).
//   2. A hard purity boundary for `src/engine/**`: the engine must be
//      framework-free (no react / react-native / expo imports) and deterministic
//      (no Math.random / Date.now / `new Date()`), per design D2/D6.
//
// `eslint-config-expo/flat` is CommonJS; importing it as default keeps this
// file working under both Node's CJS require and the ESM loader.

const expoConfig = require('eslint-config-expo/flat');
const tseslint = require('typescript-eslint');

module.exports = [
  {
    ignores: ['dist/*', '.expo/*', 'coverage/*', 'node_modules/*'],
  },
  ...expoConfig,
  {
    files: ['src/engine/**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*'],
              message:
                'src/engine must remain framework-free; do not import React.',
            },
            {
              group: ['react-native', 'react-native/*'],
              message:
                'src/engine must remain framework-free; do not import React Native.',
            },
            {
              group: ['expo', 'expo/*', '@expo/**'],
              message:
                'src/engine must remain framework-free; do not import Expo packages.',
            },
          ],
        },
      ],
      // Determinism guard (design D2): no ambient randomness.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'src/engine must be deterministic; use the injected RNG instead of Math.random.',
        },
        {
          object: 'Date',
          property: 'now',
          message:
            'src/engine must be deterministic; do not use Date.now.',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message:
            'src/engine must be deterministic; do not use Date (pass time in explicitly).',
        },
      ],
      // Catch `new Date(...)` and any `Date` reference, including typed uses.
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            'src/engine must be deterministic; do not construct Date (pass time in explicitly).',
        },
        {
          selector: "Identifier[name='Date']",
          message:
            'src/engine must be deterministic; do not use Date (pass time in explicitly).',
        },
      ],
    },
  },
];
