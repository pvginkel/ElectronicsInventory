# Tooltip Infrastructure Refactor – Plan Summary

## Overview
Consolidate ~10+ scattered tooltip implementations into a shared, accessible, and testable infrastructure.

## Scope
- Fix quick mouse movement bug where tooltips stay open
- Fix click behavior that keeps tooltips open after mouse leaves
- Create reusable `Tooltip` component and `useTooltip` hook in src/components/ui
- Migrate all existing tooltip implementations to use shared primitives
- Add contributor guidance that tooltips must contain only informational content (no interactive elements)
- Update Playwright page objects and specs for deterministic selectors

## User Impact
Consistent tooltip behavior across the entire application with proper accessibility support. Better mobile/keyboard interaction patterns.

## Complexity
High – large refactor touching many parts of the application. Requires careful migration and test updates.
