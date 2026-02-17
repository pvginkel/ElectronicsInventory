/**
 * Generic test selector helpers.
 * Template-owned — provides testId(), buildSelector(), and common UI selectors.
 *
 * Domain-specific selectors (parts, types, boxes, sellers) live in selectors-domain.ts.
 * They are re-exported here so existing consumer imports remain unchanged.
 */

import { testId } from './test-id';
import {
  partsSelectors,
  typesSelectors,
  boxesSelectors,
  sellersSelectors,
} from './selectors-domain';

export { testId };

/**
 * Common selector patterns by domain.
 * Re-exports domain selectors alongside generic common patterns
 * so consumers can use selectors.parts, selectors.common, etc.
 */
export const selectors = {
  // Domain selectors (re-exported from selectors-domain.ts)
  parts: partsSelectors,
  types: typesSelectors,
  boxes: boxesSelectors,
  sellers: sellersSelectors,

  // Common UI selectors (generic infrastructure)
  common: {
    loading: testId('loading'),
    error: testId('error'),
    toast: testId('toast'),
    search: testId('search'),
    pagination: {
      container: testId('pagination'),
      prev: testId('pagination.prev'),
      next: testId('pagination.next'),
      page: (num: number) => testId(`pagination.page.${num}`),
    },
  },
};

/**
 * Helper to build custom selectors following the pattern
 */
export function buildSelector(domain: string, section: string, element: string, id?: string): string {
  const parts = [domain, section, element];
  if (id) parts.push(id);
  return testId(parts.join('.'));
}
