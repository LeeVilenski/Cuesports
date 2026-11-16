import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dev-dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // The simulation must stay deterministic and headless.
    files: ['packages/shared/src/**/*.ts', 'packages/physics/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG from @cuesports/shared.' },
        { object: 'Math', property: 'sin', message: 'Use detSin from @cuesports/shared (deterministic).' },
        { object: 'Math', property: 'cos', message: 'Use detCos from @cuesports/shared (deterministic).' },
        { object: 'Math', property: 'exp', message: 'Use detExp from @cuesports/shared (deterministic).' },
        { object: 'Math', property: 'atan2', message: 'Avoid transcendental functions in the simulation.' },
        { object: 'Date', property: 'now', message: 'The simulation must not depend on wall-clock time.' },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'performance'],
    },
  },
);
