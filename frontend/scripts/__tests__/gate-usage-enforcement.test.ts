import { describe, it, expect } from 'vitest';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';

// Import the rule under test.
import rule from '../eslint-rules/gate-usage-enforcement.js';

// ---------------------------------------------------------------------------
// Helper: lint code with our rule, JSX + TypeScript enabled.
// typescript-eslint's parser is required because it correctly parses
// `import type` declarations and sets importKind on AST nodes, which the
// default espree parser cannot handle.
// ---------------------------------------------------------------------------

function lint(code: string): Linter.LintMessage[] {
  const linter = new Linter();
  return linter.verify(code, {
    plugins: {
      'role-gating': { rules: { 'gate-usage-enforcement': rule as any } },
    },
    rules: { 'role-gating/gate-usage-enforcement': 'error' },
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parser: tseslint.parser as any,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  } as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('gate-usage-enforcement', () => {
  describe('valid cases — no violation', () => {
    it('allows role constant used directly in Gate requires', () => {
      const messages = lint(`
        import { postBoxesRole } from '@/lib/api/generated/roles';
        function Foo() {
          return <Gate requires={postBoxesRole}><button>Add</button></Gate>;
        }
      `);
      expect(messages).toHaveLength(0);
    });

    it('allows role constant used in requires array', () => {
      const messages = lint(`
        import { postBoxesRole } from '@/lib/api/generated/roles';
        function Foo() {
          return <Gate requires={[postBoxesRole]}><button>Add</button></Gate>;
        }
      `);
      expect(messages).toHaveLength(0);
    });

    it('allows multiple role constants when all are in Gate', () => {
      const messages = lint(`
        import { postBoxesRole, deleteBoxesByBoxNoRole } from '@/lib/api/generated/roles';
        function Foo() {
          return (
            <>
              <Gate requires={postBoxesRole}><button>Add</button></Gate>
              <Gate requires={deleteBoxesByBoxNoRole}><button>Delete</button></Gate>
            </>
          );
        }
      `);
      expect(messages).toHaveLength(0);
    });

    it('allows multiple constants in a single requires array', () => {
      const messages = lint(`
        import { postBoxesRole, deleteBoxesByBoxNoRole } from '@/lib/api/generated/roles';
        function Foo() {
          return <Gate requires={[postBoxesRole, deleteBoxesByBoxNoRole]}><button>X</button></Gate>;
        }
      `);
      expect(messages).toHaveLength(0);
    });

    it('allows role constant used in hasRole() call', () => {
      const messages = lint(`
        import { putShoppingListLinesByLineIdRole } from '@/lib/api/generated/roles';
        function Foo() {
          const canDrag = hasRole(putShoppingListLinesByLineIdRole);
          return <div draggable={canDrag} />;
        }
      `);
      expect(messages).toHaveLength(0);
    });

    it('does not flag type-only imports', () => {
      const messages = lint(`
        import type { RequiredRole } from '@/lib/api/generated/roles';
      `);
      expect(messages).toHaveLength(0);
    });

    it('does not flag imports from other modules', () => {
      const messages = lint(`
        import { somethingRole } from './some-other-module';
        function Foo() {
          return <div />;
        }
      `);
      expect(messages).toHaveLength(0);
    });

    it('does not flag files with no role imports', () => {
      const messages = lint(`
        import { useState } from 'react';
        function Foo() { return <button>Click</button>; }
      `);
      expect(messages).toHaveLength(0);
    });

    it('matches roles imported via relative path suffix', () => {
      const messages = lint(`
        import { postBoxesRole } from '../api/generated/roles';
        function Foo() {
          return <Gate requires={postBoxesRole}><button>Add</button></Gate>;
        }
      `);
      expect(messages).toHaveLength(0);
    });
  });

  describe('invalid cases — violation reported', () => {
    it('reports role constant imported but never used in Gate or hasRole', () => {
      const messages = lint(`
        import { postBoxesRole } from '@/lib/api/generated/roles';
        function Foo() {
          return <button>Add</button>;
        }
      `);
      expect(messages).toHaveLength(1);
      expect(messages[0].messageId).toBe('unusedRoleConstant');
      expect(messages[0].message).toContain('postBoxesRole');
    });

    it('reports role constant that is only voided (void roleConst antipattern)', () => {
      const messages = lint(`
        import { postBoxesRole } from '@/lib/api/generated/roles';
        void postBoxesRole;
        function Foo() {
          return <button>Add</button>;
        }
      `);
      expect(messages).toHaveLength(1);
      expect(messages[0].messageId).toBe('unusedRoleConstant');
    });

    it('reports only the constant not used in Gate when multiple are imported', () => {
      const messages = lint(`
        import { postBoxesRole, deleteBoxesByBoxNoRole } from '@/lib/api/generated/roles';
        function Foo() {
          return <Gate requires={postBoxesRole}><button>Add</button></Gate>;
        }
      `);
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toContain('deleteBoxesByBoxNoRole');
    });

    it('reports all constants that are not used when none are in Gate', () => {
      const messages = lint(`
        import { postBoxesRole, deleteBoxesByBoxNoRole } from '@/lib/api/generated/roles';
        function Foo() { return <div />; }
      `);
      expect(messages).toHaveLength(2);
    });

    it('does not accept role constant used in an unrelated function call', () => {
      const messages = lint(`
        import { postBoxesRole } from '@/lib/api/generated/roles';
        function Foo() {
          console.log(postBoxesRole);
          return <div />;
        }
      `);
      expect(messages).toHaveLength(1);
    });

    it('does not accept role constant used in requires of an unrelated attribute name', () => {
      // "data-role" is not "requires"
      const messages = lint(`
        import { postBoxesRole } from '@/lib/api/generated/roles';
        function Foo() {
          return <div data-role={postBoxesRole} />;
        }
      `);
      expect(messages).toHaveLength(1);
    });
  });
});
