import js from '@eslint/js';
import globals from 'globals';

/**
 * Minimal flat config. The monorepo's ruleset (eslint.config.js there) pulls in
 * plugins tied to its own layout; this is the subset that applies to a single
 * package. Widen it toward theirs if this component is upstreamed (`W-1.4`).
 */
export default [
  js.configs.recommended,
  {
    files: ['web/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['web/test/**/*.js'],
    languageOptions: {
      globals: globals.mocha,
    },
  },
  {
    ignores: ['node_modules/', 'docs/design/', 'web/dev/'],
  },
];
