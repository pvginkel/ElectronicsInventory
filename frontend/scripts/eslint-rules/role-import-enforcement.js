/**
 * ESLint rule: role-import-enforcement
 *
 * Ensures that files importing mutation hooks from the generated hooks module
 * also import the corresponding role constant from the generated roles module.
 * This prevents developers from using mutation hooks without having the role
 * constant available for gating, keeping the codebase consistent.
 *
 * The rule reads role-map.json (produced by the generator) at initialization
 * to determine which hooks require which role constants.
 */

import { readFileSync } from 'fs';
import path from 'path';

// Resolve role-map.json relative to the project root (where ESLint runs)
const ROLE_MAP_PATH = path.join(
  process.cwd(),
  'src/lib/api/generated/role-map.json',
);

/**
 * Load the role map once per lint run. If the file is missing, the rule
 * throws a clear error directing the developer to regenerate.
 */
function loadRoleMap() {
  try {
    const raw = readFileSync(ROLE_MAP_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `role-map.json not found at ${ROLE_MAP_PATH}. Run 'pnpm generate:api' to generate it.`,
    );
  }
}

/** Suffixes that identify the generated hooks module in import paths. */
const HOOKS_IMPORT_SUFFIXES = [
  'generated/hooks',
  'api/generated/hooks',
  'lib/api/generated/hooks',
];

/** Suffixes that identify the generated roles module in import paths. */
const ROLES_IMPORT_SUFFIXES = [
  'generated/roles',
  'api/generated/roles',
  'lib/api/generated/roles',
];

function matchesSuffix(source, suffixes) {
  return suffixes.some((suffix) => source.endsWith(suffix));
}

const messages = {
  missingRoleImport:
    'Mutation hook "{{ hookName }}" requires the role constant "{{ constantName }}" to be imported from the generated roles module.',
};

const roleImportEnforcementRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that mutation hook imports are paired with their role constant imports.',
    },
    schema: [],
    messages,
  },
  defaultOptions: [],
  create(context) {
    const roleMap = loadRoleMap();

    // Track mutation hooks imported in this file and role constants imported
    const importedMutationHooks = new Map(); // hookName -> ImportSpecifier node
    const importedRoleConstants = new Set();

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== 'string') return;

        // Track imports from the generated hooks module
        if (matchesSuffix(source, HOOKS_IMPORT_SUFFIXES)) {
          for (const specifier of node.specifiers) {
            if (specifier.type !== 'ImportSpecifier') continue;
            const importedName = specifier.imported.name;
            if (roleMap[importedName]) {
              importedMutationHooks.set(importedName, specifier);
            }
          }
        }

        // Track imports from the generated roles module
        if (matchesSuffix(source, ROLES_IMPORT_SUFFIXES)) {
          for (const specifier of node.specifiers) {
            if (specifier.type !== 'ImportSpecifier') continue;
            importedRoleConstants.add(specifier.imported.name);
          }
        }
      },

      'Program:exit'() {
        // For each mutation hook imported, verify its role constant is also imported
        for (const [hookName, specifierNode] of importedMutationHooks) {
          const constantName = roleMap[hookName];
          if (!importedRoleConstants.has(constantName)) {
            context.report({
              node: specifierNode,
              messageId: 'missingRoleImport',
              data: { hookName, constantName },
            });
          }
        }
      },
    };
  },
};

export default roleImportEnforcementRule;
