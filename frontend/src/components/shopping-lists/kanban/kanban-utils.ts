/**
 * Shared types and utilities for the shopping-list Kanban board.
 *
 * Extracted from component files to avoid "fast refresh only works when a file
 * only exports components" warnings -- React HMR requires component-only exports.
 */
import type { ShoppingListSellerStatus } from '@/types/shopping-lists';

/** The three visual modes a Kanban card/column can operate in. */
export type KanbanCardMode = 'unassigned' | 'ordering' | 'receiving';

/**
 * Derive the card rendering mode from the seller group status.
 *
 * - `null` (no seller group)  -> "unassigned"
 * - `'active'`                -> "ordering"
 * - `'ordered'`               -> "receiving"
 */
export function deriveCardMode(groupStatus: ShoppingListSellerStatus | null): KanbanCardMode {
  if (groupStatus === null) return 'unassigned';
  if (groupStatus === 'ordered') return 'receiving';
  return 'ordering';
}
