import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const noHookOrClientMocks = {
  // '../api/hooks', '../api/client', './hooks', './client' (\x2F is "/", which esquery's
  // regex syntax cannot contain).
  selector:
    "CallExpression[callee.object.name='vi'][callee.property.name='mock'][arguments.0.value=/(^\\.{1,2}|api)\\x2F(hooks|client)(\\x2Findex)?$/]",
  message:
    'Do not mock the hooks or client module: declare the answers with server.use(...) from src/test/server.ts (ARCHITECTURE.md §4, "Why unit tests fake the network, not the hooks").',
};

// The Active profile's store (src/api/activeProfile.ts) is touched by two source modules only:
// the client module, which names it on every request, and the profile hooks, which expose it
// to React (ARCHITECTURE.md §4, "Where the active profile is remembered"). The import may be
// written with or without its extension. Tests go through the store's functions.
const activeProfileStore = {
  regex: '(^|/)activeProfile(\\.ts)?$',
  message:
    "Only the client module and the profile hooks touch the Active profile's store: use useActiveProfileId, useActiveProfile or chooseProfile from api/hooks.",
};

// The browser's storage holds one thing, the last Active profile, and the store is the one
// source module that reads or writes it.
const browserStorageMessage =
  'Only src/api/activeProfile.ts touches localStorage: it holds the last Active profile and nothing else.';

const typedJsonAnswers = {
  selector:
    "CallExpression[callee.object.name='HttpResponse'][callee.property.name='json']:not([typeArguments])",
  message:
    'Name the wire type of every JSON answer, HttpResponse.json<CategoryNode[]>(...): without it the body is not type-checked (ARCHITECTURE.md §4, "Why unit tests fake the network, not the hooks").',
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // A failed request becomes text in one module: screens import problemMessages, never
    // ApiError (the frontend's small counterpart to the backend's ArchUnit layer rules). Tests
    // construct ApiError fixtures, and the API layer is where it lives.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/api/**', '**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)api/client$',
              importNames: ['ApiError'],
              message:
                'Turn a failure into text with problemMessages from api/problemMessages instead.',
            },
            activeProfileStore,
          ],
        },
      ],
    },
  },
  {
    // The same rule inside the API layer, where only client.ts and hooks/profiles.ts may.
    files: ['src/api/**/*.{ts,tsx}'],
    ignores: ['src/api/client.ts', 'src/api/hooks/profiles.ts', '**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [activeProfileStore] }] },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/api/activeProfile.ts', '**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'no-restricted-globals': ['error', { name: 'localStorage', message: browserStorageMessage }],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: browserStorageMessage },
      ],
    },
  },
  {
    files: ['e2e/**/*.ts', 'playwright.config.ts', '**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // Unit tests fake the network, not the hooks (ARCHITECTURE.md §4, "Why unit tests fake the
    // network, not the hooks"; src/test/server.ts).
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', noHookOrClientMocks, typedJsonAnswers] },
  },
  {
    // The files that still mock the hooks or client module. A file leaves this list in the
    // commit that converts or deletes it; nothing is ever added.
    files: [
      'src/components/TxnModal.test.tsx',
      'src/screens/BudgetForm.test.tsx',
      'src/screens/Budgets.test.tsx',
      'src/screens/Categories.test.tsx',
      'src/screens/Dashboard.test.tsx',
      'src/screens/Insights.test.tsx',
      'src/screens/Subscriptions.test.tsx',
      'src/screens/Transactions.test.tsx',
    ],
    rules: { 'no-restricted-syntax': ['error', typedJsonAnswers] },
  },
);
