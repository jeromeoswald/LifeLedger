import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.expo/**', '**/dist/**', 'apps/mobile/**/*.config.js', '**/expo-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // the PWA service worker runs in a ServiceWorker scope; dev scripts run in Node
  { files: ['apps/mobile/public/sw.js'], languageOptions: { globals: globals.serviceworker } },
  { files: ['scripts/**/*.mjs'], languageOptions: { globals: globals.node } },
);
