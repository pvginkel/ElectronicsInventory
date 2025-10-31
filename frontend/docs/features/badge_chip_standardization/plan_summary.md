# Badge and Chip Standardization – Plan Summary

## Overview
Standardize badge and link chip visualization across all detail views (kit, pick list, shopping list, part).

## Scope
- Move link chips out of headers to match part detail view placement
- Restrict title-adjacent badges to key and status only
- Move all attribute badges below title into detail-screen.metadata section
- Standardize all badges to use `<key>: <value>` format with consistent colors
- Abstract badge wrappers (DetailBadge, SummaryBadge, GroupSummaryBadge) into reusable components

## User Impact
Consistent visual language for badges and chips across all detail screens. Cleaner information hierarchy.

## Complexity
Medium – requires coordination across multiple views and component abstraction.
