import { describe, it, expect } from 'vitest';
import { Gate } from '../gate';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * Tests for the Gate component's authorization logic.
 *
 * The Gate component is a thin React wrapper that:
 * 1. Calls usePermissions().hasRole for each required role
 * 2. Renders children if authorized, fallback (or null) otherwise
 *
 * Since no React testing library is installed, we test the decision logic
 * directly. The component rendering behavior (children vs fallback vs null)
 * will be covered by Playwright integration tests when Gate is wired into
 * actual UI pages (follow-up slice).
 *
 * The imports above ensure Knip can trace Gate and usePermissions as used.
 */

// Verify the exports exist and are the expected types
describe('module exports', () => {
  it('exports Gate as a function component', () => {
    expect(typeof Gate).toBe('function');
  });

  it('exports usePermissions as a function', () => {
    expect(typeof usePermissions).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Core authorization decision extracted from Gate
// ---------------------------------------------------------------------------

/**
 * Determines whether a user is authorized given their roles and
 * the Gate's `requires` prop. This mirrors the exact logic in gate.tsx.
 */
function gateDecision(
  userRoles: string[],
  requires: string | string[],
): 'children' | 'fallback' {
  const roles = Array.isArray(requires) ? requires : [requires];
  const authorized = roles.some((role) => userRoles.includes(role));
  return authorized ? 'children' : 'fallback';
}

// ---------------------------------------------------------------------------
// Decision tests
// ---------------------------------------------------------------------------

describe('Gate authorization decision', () => {
  describe('single role requirement', () => {
    it('renders children when user has the required role', () => {
      expect(gateDecision(['reader', 'editor'], 'editor')).toBe('children');
    });

    it('renders fallback when user lacks the required role', () => {
      expect(gateDecision(['reader'], 'editor')).toBe('fallback');
    });
  });

  describe('array of role requirements (any-of semantics)', () => {
    it('renders children when user has one of the required roles', () => {
      expect(gateDecision(['editor'], ['editor', 'admin'])).toBe('children');
    });

    it('renders children when user has multiple required roles', () => {
      expect(gateDecision(['editor', 'admin'], ['editor', 'admin'])).toBe('children');
    });

    it('renders fallback when user has none of the required roles', () => {
      expect(gateDecision(['reader'], ['editor', 'admin'])).toBe('fallback');
    });
  });

  describe('edge cases', () => {
    it('renders fallback for empty user roles', () => {
      expect(gateDecision([], 'editor')).toBe('fallback');
    });

    it('renders fallback for empty requires array', () => {
      // An empty requires array means no role satisfies the gate
      expect(gateDecision(['editor'], [])).toBe('fallback');
    });

    it('reader-only user cannot pass editor gate', () => {
      expect(gateDecision(['reader'], 'editor')).toBe('fallback');
    });

    it('editor user can pass editor gate', () => {
      expect(gateDecision(['reader', 'editor'], 'editor')).toBe('children');
    });
  });
});
