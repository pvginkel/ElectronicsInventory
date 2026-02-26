import { describe, it, expect, vi } from 'vitest';
import { Linter } from 'eslint';

// Mock fs.readFileSync so the rule reads a controlled role map instead of
// requiring the generated file on disk. Must be set up before the rule is
// imported because loadRoleMap() runs at module evaluation time.
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn((filePath: string, ...args: unknown[]) => {
      if (typeof filePath === 'string' && filePath.endsWith('role-map.json')) {
        return JSON.stringify({
          useDeletePartsByPartKey: 'deletePartsByPartKeyRole',
          usePostBoxes: 'postBoxesRole',
          usePutTypesByTypeId: 'putTypesByTypeIdRole',
        });
      }
      // Fall through to the real implementation for other files
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      return (actual.readFileSync as Function)(filePath, ...args);
    }),
  };
});

// Import the rule after the mock is in place.
import rule from '../eslint-rules/role-import-enforcement.js';

// ---------------------------------------------------------------------------
// Helper: lint code with our rule and return only our rule's messages
// ---------------------------------------------------------------------------

function lint(code: string): Linter.LintMessage[] {
  const linter = new Linter();
  return linter.verify(code, {
    plugins: {
      'role-gating': { rules: { 'role-import-enforcement': rule as any } },
    },
    rules: { 'role-gating/role-import-enforcement': 'error' },
    languageOptions: { ecmaVersion: 2020, sourceType: 'module' },
  } as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('role-import-enforcement', () => {
  describe('valid cases', () => {
    it('allows mutation hook with corresponding role constant imported', () => {
      const messages = lint(`
        import { useDeletePartsByPartKey } from '@/lib/api/generated/hooks';
        import { deletePartsByPartKeyRole } from '@/lib/api/generated/roles';
      `);
      expect(messages).toHaveLength(0);
    });

    it('allows query hook (not in role map) without role import', () => {
      const messages = lint(`
        import { useGetPartsByPartKey } from '@/lib/api/generated/hooks';
      `);
      expect(messages).toHaveLength(0);
    });

    it('allows multiple mutation hooks with all role constants imported', () => {
      const messages = lint(`
        import { useDeletePartsByPartKey, usePostBoxes } from '@/lib/api/generated/hooks';
        import { deletePartsByPartKeyRole, postBoxesRole } from '@/lib/api/generated/roles';
      `);
      expect(messages).toHaveLength(0);
    });

    it('allows files with no imports from generated hooks', () => {
      const messages = lint(`
        import { useState } from 'react';
      `);
      expect(messages).toHaveLength(0);
    });

    it('matches hooks imported via relative path suffix', () => {
      const messages = lint(`
        import { usePutTypesByTypeId } from '../api/generated/hooks';
        import { putTypesByTypeIdRole } from '../api/generated/roles';
      `);
      expect(messages).toHaveLength(0);
    });
  });

  describe('invalid cases', () => {
    it('reports mutation hook without role constant import', () => {
      const messages = lint(`
        import { useDeletePartsByPartKey } from '@/lib/api/generated/hooks';
      `);
      expect(messages).toHaveLength(1);
      expect(messages[0].messageId).toBe('missingRoleImport');
      expect(messages[0].message).toContain('useDeletePartsByPartKey');
      expect(messages[0].message).toContain('deletePartsByPartKeyRole');
    });

    it('reports only the mutation hook missing its role constant', () => {
      const messages = lint(`
        import { useDeletePartsByPartKey, usePostBoxes } from '@/lib/api/generated/hooks';
        import { deletePartsByPartKeyRole } from '@/lib/api/generated/roles';
      `);
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toContain('usePostBoxes');
      expect(messages[0].message).toContain('postBoxesRole');
    });

    it('does not accept role constant imported from wrong module', () => {
      const messages = lint(`
        import { useDeletePartsByPartKey } from '@/lib/api/generated/hooks';
        import { deletePartsByPartKeyRole } from './some-other-module';
      `);
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toContain('useDeletePartsByPartKey');
    });

    it('reports all missing role constants when multiple hooks lack them', () => {
      const messages = lint(`
        import { useDeletePartsByPartKey, usePostBoxes, usePutTypesByTypeId } from '@/lib/api/generated/hooks';
      `);
      expect(messages).toHaveLength(3);
    });
  });
});
