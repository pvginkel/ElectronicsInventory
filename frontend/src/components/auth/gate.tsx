/**
 * Gate component for declarative role-based UI gating.
 *
 * Conditionally renders children based on whether the authenticated user
 * holds the required role(s). This is a UX convenience -- the backend
 * enforces roles on every endpoint regardless of frontend gating.
 *
 * Usage:
 *   <Gate requires="editor">
 *     <DeleteButton />
 *   </Gate>
 *
 *   <Gate requires={["editor", "admin"]} fallback={<DisabledButton />}>
 *     <EditButton />
 *   </Gate>
 */

import { type ReactNode } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import type { RequiredRole } from '@/lib/api/generated/roles';

interface GateProps {
  /** Role or roles the user must hold. If an array, the user needs at least one. */
  requires: RequiredRole | RequiredRole[];
  /** Rendered when the user lacks the required role(s). Defaults to null. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Declarative role gate.
 *
 * - If the user has any of the required roles, children render normally.
 * - If the user lacks all required roles and a fallback is provided, the
 *   fallback renders (e.g., a disabled button with a tooltip).
 * - If the user lacks all required roles and no fallback is given, nothing
 *   renders.
 */
export function Gate({ requires, fallback = null, children }: GateProps) {
  const { hasRole } = usePermissions();

  // Normalize to array for uniform handling
  const roles = Array.isArray(requires) ? requires : [requires];

  // User needs at least one of the required roles
  const authorized = roles.some((role) => hasRole(role));

  if (authorized) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
