import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
export default tseslint.config(
  { ignores: ['.next/**', 'out/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.tsx'], plugins: { 'react-hooks': hooks, 'jsx-a11y': a11y }, rules: { ...hooks.configs.recommended.rules, ...a11y.configs.recommended.rules } },
  { files: ['**/*.mjs', '**/*.ts', '**/*.tsx'], languageOptions: { globals: { process: 'readonly', Buffer: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', fetch: 'readonly', Request: 'readonly', Response: 'readonly', AbortController: 'readonly', AbortSignal: 'readonly', TextEncoder: 'readonly', window: 'readonly', document: 'readonly', URL: 'readonly', Blob: 'readonly', BroadcastChannel: 'readonly', indexedDB: 'readonly', structuredClone: 'readonly' } } },
);
