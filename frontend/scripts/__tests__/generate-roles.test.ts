import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync } from 'fs';

// Import helpers directly from the generator script (relative import --
// the @ path alias does not resolve outside src/).
import {
  generateRoles,
  transformOperationId,
  capitalize,
  hookNameToRoleConstant,
} from '../generate-api.js';

// ---------------------------------------------------------------------------
// Mock writeFileSync so generateRoles() does not write to disk.
// ---------------------------------------------------------------------------

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    writeFileSync: vi.fn(),
  };
});

const mockedWriteFileSync = vi.mocked(writeFileSync);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal spec with the given paths and x-auth-roles. */
function buildSpec(
  paths: Record<string, Record<string, { operationId: string; 'x-required-role'?: string }>>,
  readRole = 'reader',
) {
  return {
    'x-auth-roles': { admin: 'admin', read: readRole, write: 'editor' },
    paths,
  };
}

/** Retrieve what was written to a given file path via the mocked writeFileSync. */
function getWrittenContent(fileSuffix: string): string {
  for (const call of mockedWriteFileSync.mock.calls) {
    const [filePath, content] = call as [string, string];
    if (typeof filePath === 'string' && filePath.endsWith(fileSuffix)) {
      return content;
    }
  }
  throw new Error(`No write found for suffix "${fileSuffix}"`);
}

// ---------------------------------------------------------------------------
// hookNameToRoleConstant
// ---------------------------------------------------------------------------

describe('hookNameToRoleConstant', () => {
  it('strips "use" prefix, lowercases first char, and appends "Role"', () => {
    expect(hookNameToRoleConstant('useDeletePartsByPartKey')).toBe(
      'deletePartsByPartKeyRole',
    );
  });

  it('handles simple hook names', () => {
    expect(hookNameToRoleConstant('usePostBoxes')).toBe('postBoxesRole');
  });
});

// ---------------------------------------------------------------------------
// transformOperationId + capitalize (used by the generator)
// ---------------------------------------------------------------------------

describe('transformOperationId', () => {
  it('converts operationId to camelCase hook stem', () => {
    const result = transformOperationId('delete__api_parts_{part_key}');
    expect(`use${capitalize(result)}`).toBe('useDeletePartsByPartKey');
  });
});

// ---------------------------------------------------------------------------
// generateRoles
// ---------------------------------------------------------------------------

describe('generateRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates constants for non-read-role endpoints', () => {
    const spec = buildSpec({
      '/api/parts': {
        get: { operationId: 'get__api_parts', 'x-required-role': 'reader' },
        post: { operationId: 'post__api_parts', 'x-required-role': 'editor' },
      },
    });

    generateRoles(spec);

    const rolesContent = getWrittenContent('roles.ts');
    expect(rolesContent).toContain('export const postPartsRole = "editor" as const;');
    expect(rolesContent).toContain('export type RequiredRole = "editor";');
    // Reader-level GET should NOT produce a constant
    expect(rolesContent).not.toContain('getPartsRole');
  });

  it('populates role-map.json with mutation hooks only', () => {
    const spec = buildSpec({
      '/api/parts': {
        get: { operationId: 'get__api_parts', 'x-required-role': 'editor' },
        post: { operationId: 'post__api_parts', 'x-required-role': 'editor' },
      },
    });

    generateRoles(spec);

    const mapContent = getWrittenContent('role-map.json');
    const map = JSON.parse(mapContent);

    // POST is a mutation, so it should be in the map
    expect(map).toHaveProperty('usePostParts', 'postPartsRole');

    // GET is not a mutation, so even though it has a non-read role,
    // it should NOT be in the role map
    expect(map).not.toHaveProperty('useGetParts');
  });

  it('skips endpoints without x-required-role', () => {
    const spec = buildSpec({
      '/api/auth/self': {
        get: { operationId: 'get__api_auth_self' },
      },
    });

    generateRoles(spec);

    const rolesContent = getWrittenContent('roles.ts');
    // No constants generated for endpoint without x-required-role
    expect(rolesContent).not.toContain('getAuthSelfRole');
  });

  it('skips endpoints whose x-required-role matches the read role', () => {
    const spec = buildSpec({
      '/api/parts': {
        get: { operationId: 'get__api_parts', 'x-required-role': 'reader' },
      },
    });

    generateRoles(spec);

    const rolesContent = getWrittenContent('roles.ts');
    expect(rolesContent).not.toContain('getPartsRole');
  });

  it('builds RequiredRole union from distinct non-read values', () => {
    const spec = {
      'x-auth-roles': { admin: 'admin', read: 'reader', write: 'editor' },
      paths: {
        '/api/parts': {
          post: { operationId: 'post__api_parts', 'x-required-role': 'editor' },
        },
        '/api/admin/config': {
          put: { operationId: 'put__api_admin_config', 'x-required-role': 'admin' },
        },
      },
    };

    generateRoles(spec);

    const rolesContent = getWrittenContent('roles.ts');
    // Union should include both "admin" and "editor"
    expect(rolesContent).toContain('export type RequiredRole = "admin" | "editor";');
  });

  it('skips generation entirely when x-auth-roles.read is missing', () => {
    const spec = {
      'x-auth-roles': {},
      paths: {
        '/api/parts': {
          post: { operationId: 'post__api_parts', 'x-required-role': 'editor' },
        },
      },
    };

    generateRoles(spec);

    // writeFileSync should not have been called
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('sorts constants alphabetically for stable output', () => {
    const spec = buildSpec({
      '/api/types': {
        post: { operationId: 'post__api_types', 'x-required-role': 'editor' },
      },
      '/api/boxes': {
        post: { operationId: 'post__api_boxes', 'x-required-role': 'editor' },
      },
    });

    generateRoles(spec);

    const rolesContent = getWrittenContent('roles.ts');
    const lines = rolesContent.split('\n').filter((l: string) => l.startsWith('export const'));
    expect(lines[0]).toContain('postBoxesRole');
    expect(lines[1]).toContain('postTypesRole');
  });
});
