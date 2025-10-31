# Outstanding Changes – Feature Slices Overview

This document provides an index of all feature slices created from the outstanding changes. Each slice can be completed in a single sitting.

## Feature Slice Index

### 1. Icon and Animation Polish
- **Path**: `docs/features/icon_and_animation_polish/`
- **Complexity**: Low
- **Research Required**: No
- **Summary**: Replace sidebar icons with Lucide icons and apply card animation consistently

### 2. Toast System Improvements
- **Path**: `docs/features/toast_system_improvements/`
- **Complexity**: Medium
- **Research Required**: Yes (see `plan_research.md`)
- **Summary**: Fix toast overflow and auto-close issues, research undo button candidates

### 3. Tooltip Infrastructure Refactor
- **Path**: `docs/features/tooltip_infrastructure_refactor/`
- **Complexity**: High
- **Research Required**: No
- **Summary**: Consolidate ~10+ tooltip implementations into shared component and hook

### 4. Badge and Chip Standardization
- **Path**: `docs/features/badge_chip_standardization/`
- **Complexity**: Medium
- **Research Required**: No
- **Summary**: Standardize badge/chip placement and styling across all detail views

### 5. Button System Review
- **Path**: `docs/features/button_system_review/`
- **Complexity**: Medium
- **Research Required**: Yes (see `plan_research.md`)
- **Summary**: Fix button wrapping and audit/update all button labels to follow standards

### 6. Kit Feature Refinements
- **Path**: `docs/features/kit_feature_refinements/`
- **Complexity**: Medium
- **Research Required**: No
- **Summary**: Multiple kit improvements including batch queries, menu reorganization, and bug fixes

### 7. Shopping List Improvements
- **Path**: `docs/features/shopping_list_improvements/`
- **Complexity**: Low
- **Research Required**: No
- **Summary**: Add kit unlink feature and fix skeleton padding

### 8. Table and List Refinements
- **Path**: `docs/features/table_list_refinements/`
- **Complexity**: Medium
- **Research Required**: No
- **Summary**: Fix table corners and implement search debounce app-wide

### 9. Minor Fixes and Cleanup
- **Path**: `docs/features/minor_fixes_cleanup/`
- **Complexity**: Low
- **Research Required**: No
- **Summary**: Add pick list delete functionality and remove part refresh option

## Workflow

### For slices without research required:
1. Review `plan_summary.md`
2. Create full `plan.md` using the template in `docs/commands/plan_feature.md`
3. Implement according to plan

### For slices with research required:
1. Review `plan_summary.md` and `plan_research.md`
2. Execute research and create output document (e.g., `undo_candidates.md`, `button_audit.md`)
3. User reviews research output and confirms requirements
4. Create full `plan.md` using the template in `docs/commands/plan_feature.md`
5. Implement according to plan

## Suggested Order

For logical dependency flow, consider this order:
1. **Minor Fixes and Cleanup** (quick wins)
2. **Icon and Animation Polish** (quick wins)
3. **Toast System Improvements** (research → implement)
4. **Shopping List Improvements** (simple feature addition)
5. **Table and List Refinements** (architectural consideration for search)
6. **Button System Review** (research → systematic updates)
7. **Badge and Chip Standardization** (cross-cutting visual changes)
8. **Kit Feature Refinements** (multiple related improvements)
9. **Tooltip Infrastructure Refactor** (largest refactor, save for last)

However, slices are designed to be independent and can be tackled in any order based on priority.
