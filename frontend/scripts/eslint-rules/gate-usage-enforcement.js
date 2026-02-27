/**
 * ESLint rule: gate-usage-enforcement
 *
 * In .tsx component files, every role constant imported from the generated
 * roles module must be used in either:
 *   1. A <Gate requires={roleConst}> or <Gate requires={[roleConst]}> JSX attribute, or
 *   2. A hasRole(roleConst) call expression.
 *
 * Simply voiding the constant (void roleConst) is NOT accepted as valid usage.
 * To suppress the rule for legitimate cases where the Gate lives in a child
 * component, add an ESLint disable comment with a justification:
 *
 *   // eslint-disable-next-line role-gating/gate-usage-enforcement -- <reason>
 *   import { myRoleConst } from '@/lib/api/generated/roles';
 *
 * This rule applies only to .tsx files (component files with JSX). Hook files
 * (.ts) are excluded via the eslint.config.js file glob.
 */

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
  unusedRoleConstant:
    'Role constant "{{ name }}" is imported but not used in a <Gate requires={...}> or hasRole(...) expression. ' +
    'Gate an element with it, or suppress this rule with a disable comment and justification if the Gate lives in a child component.',
};

const gateUsageEnforcementRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that imported role constants are used in Gate or hasRole expressions.',
    },
    schema: [],
    messages,
  },
  defaultOptions: [],
  create(context) {
    // Map: role constant name → ImportSpecifier node (for reporting location)
    const importedRoleConstants = new Map();

    // Set of role constant names confirmed used in <Gate requires> or hasRole()
    const usedConstants = new Set();

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== 'string') return;
        if (!matchesSuffix(source, ROLES_IMPORT_SUFFIXES)) return;

        // Skip import-type declarations entirely (import type { ... })
        if (node.importKind === 'type') return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          // Skip individual type-only specifiers
          if (specifier.importKind === 'type') continue;
          importedRoleConstants.set(specifier.imported.name, specifier);
        }
      },

      // Detect <Gate requires={roleConst}> and <Gate requires={[roleA, roleB]}>
      // Any JSX `requires` attribute counts; this is intentionally broad because
      // `requires` is semantically specific to the Gate component in this codebase.
      JSXAttribute(node) {
        if (node.name.name !== 'requires') return;
        const value = node.value;
        if (!value || value.type !== 'JSXExpressionContainer') return;

        const expr = value.expression;
        if (expr.type === 'Identifier') {
          // requires={roleConst}
          usedConstants.add(expr.name);
        } else if (expr.type === 'ArrayExpression') {
          // requires={[roleA, roleB]}
          for (const element of expr.elements) {
            if (element && element.type === 'Identifier') {
              usedConstants.add(element.name);
            }
          }
        }
      },

      // Detect hasRole(roleConst) — the imperative pattern for non-JSX gating
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'Identifier' || callee.name !== 'hasRole') return;
        const arg = node.arguments[0];
        if (arg && arg.type === 'Identifier') {
          usedConstants.add(arg.name);
        }
      },

      'Program:exit'() {
        for (const [name, specifierNode] of importedRoleConstants) {
          if (!usedConstants.has(name)) {
            context.report({
              node: specifierNode,
              messageId: 'unusedRoleConstant',
              data: { name },
            });
          }
        }
      },
    };
  },
};

export default gateUsageEnforcementRule;
