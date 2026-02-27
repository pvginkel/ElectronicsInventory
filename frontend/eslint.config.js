import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import testingNoRouteMocksRule from './scripts/eslint-rules/testing/no-route-mocks.js'
import roleImportEnforcementRule from './scripts/eslint-rules/role-import-enforcement.js'
import gateUsageEnforcementRule from './scripts/eslint-rules/gate-usage-enforcement.js'

export default tseslint.config([
  { ignores: ['dist', 'node_modules', '.pnpm-store', '*.gen.ts', 'src/lib/api/generated/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message:
            'Date.now() is reserved for real timestamps. Use makeUnique() or other approved helpers for ID generation, or add a documented disable comment.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'role-gating': {
        rules: {
          'role-import-enforcement': roleImportEnforcementRule,
          'gate-usage-enforcement': gateUsageEnforcementRule,
        },
      },
    },
    rules: {
      // Every mutation hook import must be paired with its role constant.
      // Gate is wired into all UI pages -- see docs/features/role_gating_wiring/.
      'role-gating/role-import-enforcement': 'error',
    },
  },
  {
    // Every role constant imported in a component file must be used in
    // <Gate requires={...}> or hasRole(...). Applies only to TSX files
    // (hook files import role constants next to mutation hooks without JSX).
    files: ['src/**/*.tsx'],
    rules: {
      'role-gating/gate-usage-enforcement': 'error',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      testing: {
        rules: {
          'no-route-mocks': testingNoRouteMocksRule,
        },
      },
    },
    rules: {
      'testing/no-route-mocks': 'error',
    },
  },
])
