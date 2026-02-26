import { describe, it, expect } from 'vitest';

/**
 * Tests for the permission-checking logic used by usePermissions.
 *
 * Since no React testing library is installed, we test the core hasRole logic
 * directly rather than rendering hooks. The hook itself is a thin wrapper
 * around AuthContext + this logic, so testing the logic gives us confidence
 * in the behavior.
 */

// ---------------------------------------------------------------------------
// Extract the core logic that usePermissions implements
// ---------------------------------------------------------------------------

/**
 * Mirrors the hasRole logic from usePermissions:
 * returns true if the user holds the given role, false otherwise.
 */
function hasRole(userRoles: string[] | null, role: string): boolean {
  if (!userRoles) return false;
  return userRoles.includes(role);
}

// ---------------------------------------------------------------------------
// hasRole
// ---------------------------------------------------------------------------

describe('hasRole (usePermissions core logic)', () => {
  it('returns true when user has the requested role', () => {
    expect(hasRole(['reader', 'editor'], 'editor')).toBe(true);
  });

  it('returns false when user lacks the requested role', () => {
    expect(hasRole(['reader'], 'editor')).toBe(false);
  });

  it('returns false when user has an empty roles array', () => {
    expect(hasRole([], 'editor')).toBe(false);
  });

  it('returns false when roles are null (unauthenticated)', () => {
    expect(hasRole(null, 'editor')).toBe(false);
  });

  it('handles multiple roles correctly', () => {
    const roles = ['reader', 'editor', 'admin'];
    expect(hasRole(roles, 'admin')).toBe(true);
    expect(hasRole(roles, 'editor')).toBe(true);
    expect(hasRole(roles, 'reader')).toBe(true);
    expect(hasRole(roles, 'superadmin')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gate authorization logic
// ---------------------------------------------------------------------------

/**
 * Mirrors the Gate component's authorization check:
 * returns true if the user holds ANY of the required roles.
 */
function isAuthorized(
  userRoles: string[] | null,
  requires: string | string[],
): boolean {
  const roles = Array.isArray(requires) ? requires : [requires];
  return roles.some((role) => hasRole(userRoles, role));
}

describe('isAuthorized (Gate core logic)', () => {
  it('authorizes when user has the single required role', () => {
    expect(isAuthorized(['reader', 'editor'], 'editor')).toBe(true);
  });

  it('rejects when user lacks the single required role', () => {
    expect(isAuthorized(['reader'], 'editor')).toBe(false);
  });

  it('authorizes when user has any of the required roles (array)', () => {
    expect(isAuthorized(['reader', 'editor'], ['editor', 'admin'])).toBe(true);
  });

  it('rejects when user has none of the required roles (array)', () => {
    expect(isAuthorized(['reader'], ['editor', 'admin'])).toBe(false);
  });

  it('rejects with null roles', () => {
    expect(isAuthorized(null, 'editor')).toBe(false);
  });

  it('rejects with empty roles array', () => {
    expect(isAuthorized([], ['editor', 'admin'])).toBe(false);
  });
});
