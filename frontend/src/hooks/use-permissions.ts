/**
 * Hook for role-based permission checks.
 * Provides a `hasRole` function that checks whether the authenticated user
 * holds a specific role. Used internally by the Gate component and available
 * for imperative checks in component code.
 *
 * Note: Role gating in the frontend is a UX convenience, not a security
 * boundary. The backend enforces x-required-role on every endpoint.
 */

import { useAuthContext } from '@/contexts/auth-context';
import type { RequiredRole } from '@/lib/api/generated/roles';

interface UsePermissionsResult {
  /** Returns true if the current user holds the given role. */
  hasRole: (role: RequiredRole) => boolean;
}

/**
 * Imperative role-check hook.
 *
 * Must be called within an AuthProvider — useAuthContext throws otherwise.
 * In practice, AuthGate prevents the app tree from rendering before auth
 * resolves, so `user` is always non-null when this hook runs.
 */
export function usePermissions(): UsePermissionsResult {
  const { user } = useAuthContext();

  const hasRole = (role: RequiredRole): boolean => {
    if (!user) return false;
    return user.roles.includes(role);
  };

  return { hasRole };
}
