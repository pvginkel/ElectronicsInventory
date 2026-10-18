// The app's own ESLint config blocks. The template's eslint.config.js
// (template-owned) spreads this array after its own blocks, so a block here
// can add an app's rules or override the template's. This file is app-owned:
// copier writes it once and never updates it.

import roleImportEnforcementRule from './scripts/eslint-rules/role-import-enforcement.js'
import gateUsageEnforcementRule from './scripts/eslint-rules/gate-usage-enforcement.js'

export default [
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
]
