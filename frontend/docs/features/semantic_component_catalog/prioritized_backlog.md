# Semantic Component Catalog — Prioritized Backlog

**Created:** 2025-11-02
**Last Verification:** 2025-11-02

This document provides a prioritized implementation backlog for component extraction opportunities identified in the semantic component catalog.

## Summary

**Total Patterns Analyzed:** 15+ pattern categories across cards, dialogs, lists, forms, and detail screens

**Existing High-Level Abstractions (Already Implemented):** 6
- ConfirmDialog
- ListScreenLayout
- DescriptionList + DescriptionItem
- DetailScreenLayout
- FormScreenLayout
- Form primitives (Form, FormField, FormLabel, etc.)

**New Extraction Opportunities:** 1 (with conditions)
- GridTileCard (Medium priority, needs design decision)

**Composition Patterns (No extraction recommended):** 3
- Form Dialogs
- Entity Lists
- Detail Screen Content

## Priority Scoring Method

Priority Score = Instance Count × Complexity Weight

**Complexity Weights:**
- Low = 1
- Medium = 3
- High = 5

**Minimum Thresholds for Inclusion:**
- Minimum 3 instances
- Minimum "Medium" complexity OR minimum 5 instances for "Low" complexity
- Clear semantic meaning (describes "what," not "how")

## Verification Status

All patterns were verified on 2025-11-02:

```bash
# Grid tile cards
find src/components -name '*-card.tsx' -o -name '*card.tsx' | grep -E '(type|seller|box|kit|part|overview)' | wc -l
# Result: 7 files

# Grid-tile variant usage
grep -r 'variant="grid-tile"' src/components --include="*card*.tsx" | wc -l
# Result: 3 matches (some cards inline the variant or use different patterns)

# Dialog files
find src/components -name '*dialog*.tsx' | grep -v 'src/components/ui/dialog.tsx' | wc -l
# Result: 13 files
```

**Verification Discrepancies:** None significant. Card file count is 7 (expected 6-8), dialog count is 13 (expected 13-15). All counts within acceptable range.

---

## Phase 1: High-Impact Opportunities

### 1. GridTileCard (Entity Card with Actions)

**Priority Score:** 30 (6 instances × 5 complexity weight)

**Status:** ⚠️ **Design Decision Required**

**Rationale:**
The GridTileCard pattern appears across 6 entity types (types, sellers, boxes, shopping lists, kits, parts). However, there is **very high API variance** between simple cards (45-65 lines) and complex cards (269-281 lines). The complex cards have domain-specific features that may not generalize well:
- Complex membership indicators with async data and tooltips (KitCard, PartListItem)
- Cover image display (PartListItem only)
- Metadata badges (PartListItem only)
- Progress bars (BoxCard only)

**Recommendation:**

**Option A: Extract a Minimal GridTileCard** (Lower ROI, but safe)
- Provides card container, test ID, click handling, disabled state
- Delegates all content to render slots (header, content, actions, badges)
- Essentially a thin wrapper around `<Card variant="grid-tile">` with standard interaction patterns
- **ROI:** Low - Only saves ~10-15 lines per instance. May not be worth the abstraction overhead.

**Option B: Do Not Extract** (Recommended)
- Current domain-specific cards are 45-281 lines, which is reasonable for complete features
- Each card has clear semantic meaning (TypeCard, SellerCard, etc.)
- High variance in outlier props makes a unified API complex
- Existing building blocks (Card, CardHeader, CardContent) already provide composability
- **ROI:** Avoiding a premature abstraction may be more valuable than forced unification

**Option C: Extract Shared Sub-Components First**
- Before extracting GridTileCard, evaluate whether sub-patterns have better ROI:
  - Membership indicator pattern (already abstracted as MembershipIndicator)
  - Metadata badge pattern (already abstracted as InformationBadge)
  - Action button groups (already rejected as too low-level)
- **ROI:** May already be complete - check if additional sub-components are needed

**Decision Point:** Review with team. If simple cards (TypeCard, SellerCard) are the primary pain point, consider extracting a "SimpleTileCard" that covers the 80% case and leaves complex cards (KitCard, PartListItem) as-is. If maintenance burden is low, defer extraction.

**Estimated Effort:** 3-5 days (design, implement, migrate 6 instances, test)

**Dependencies:** None

---

## Phase 2: Medium-Impact Opportunities

*No medium-impact opportunities identified.*

All analyzed patterns either:
- Already have excellent abstractions (ListScreenLayout, DetailScreenLayout, FormScreenLayout, ConfirmDialog, DescriptionList)
- Are composition patterns where domain-specific variance is appropriate (form dialogs, entity lists, detail screens)
- Have insufficient instances or complexity to justify extraction

---

## Phase 3: Low-Impact / Monitoring

### Patterns to Monitor

These patterns did not meet extraction thresholds but should be monitored as the codebase evolves:

**1. MetricsCard**
- **Current Status:** Only 1 instance (dashboard metrics)
- **Monitor For:** If additional dashboard screens or stats displays are added, re-evaluate for extraction
- **Threshold:** 3+ instances with consistent API

**2. Form Field Groupings**
- **Current Status:** Common patterns like "Name + Description" appear in multiple forms
- **Monitor For:** If specific field combinations repeat 5+ times with identical validation, consider extracting compound field components
- **Current Mitigation:** Form primitives (FormField, FormLabel, Input) already provide good composability

**3. Empty State Patterns**
- **Current Status:** EmptyState component exists; usage patterns vary by context
- **Monitor For:** If specific empty state messages/actions repeat frequently, consider domain-specific empty state components
- **Current Mitigation:** EmptyState component is flexible and handles most cases

---

## Already Implemented (Success Stories)

These high-level semantic abstractions are already in place and serve as examples of the target abstraction level:

### ✅ ConfirmDialog
- **Impact:** Eliminates boilerplate for all confirmation flows
- **Success Indicators:** Used across the codebase, clear API, easy to use
- **Pattern:** Single-purpose dialog with confirm/cancel actions

### ✅ ListScreenLayout
- **Impact:** Provides consistent UX for all list/grid screens
- **Success Indicators:** Used by all major entity lists, comprehensive render slots
- **Pattern:** Layout abstraction with fixed header and scrollable content

### ✅ DetailScreenLayout
- **Impact:** Provides consistent UX for all detail/view screens
- **Success Indicators:** Used across entity detail screens, flexible metadata areas
- **Pattern:** Layout abstraction with header, content, and optional footer/toolbar

### ✅ FormScreenLayout
- **Impact:** Provides consistent UX for full-page forms
- **Success Indicators:** Clean card-based layout for forms
- **Pattern:** Layout abstraction with form-specific styling

### ✅ DescriptionList + DescriptionItem
- **Impact:** Consistent label-value pair display across detail screens
- **Success Indicators:** Variant system (default, prominent, compact, muted), icon support
- **Pattern:** Flexible content display with semantic variants

### ✅ MembershipIndicator
- **Impact:** Consistent pattern for showing entity membership status with tooltips
- **Success Indicators:** Used in KitCard and PartListItem, handles loading/error/success states
- **Pattern:** Indicator with async data and tooltip content

---

## Rejected Patterns (Documented for Future Reference)

### ❌ ActionButtonGroup
- **Reason:** Too low-level, creates composition overhead without semantic value
- **Alternative:** Inline button groups with flex container (7 lines)
- **Evidence:** User feedback indicated low-level components are not valuable

### ❌ FlexRow / Layout Utilities
- **Reason:** Describes layout (how), not meaning (what). Violates semantic principle.
- **Alternative:** Use Tailwind utility classes directly

### ❌ SellerGroupCard as GridTileCard
- **Reason:** Not a grid tile card; it's a complex section/container with an embedded table
- **Alternative:** Keep as domain-specific component

### ❌ Form Dialog Pattern
- **Reason:** High semantic variance, existing primitives work well, TypeScript generics would be complex
- **Alternative:** Compose Dialog + Form + FormField components in domain-specific dialogs

### ❌ Entity List Pattern
- **Reason:** Domain-specific filtering, queries, and cards; ListScreenLayout already provides structure
- **Alternative:** Use ListScreenLayout and compose domain-specific content

---

## Implementation Recommendations

### For Phase 1 (GridTileCard)

**Before implementing, answer these questions:**

1. **What is the primary pain point?**
   - If maintenance burden is low (cards change infrequently), defer extraction
   - If new entity types are added regularly and card boilerplate is copy-pasted, proceed with extraction

2. **What subset of cards should be unified?**
   - Consider extracting a "SimpleTileCard" that covers TypeCard, SellerCard, BoxCard, ShoppingListOverviewCard
   - Leave complex cards (KitCard, PartListItem) as-is to avoid over-abstraction

3. **What API design minimizes complexity?**
   - Use render slots for header, content, actions, badges
   - Provide sensible defaults for common cases (onClick, disabled, testId)
   - Do NOT try to unify outlier props (membership indicators, cover images, progress bars)

4. **How will migration be handled?**
   - Incremental migration: Start with 1-2 simple cards, validate approach, then migrate others
   - Do NOT migrate all cards at once; risk of disrupting working code is high

5. **What is the success criteria?**
   - Reduction in lines of code (target: 30-50% reduction for simple cards)
   - Improved consistency in interaction patterns (click handling, keyboard navigation, disabled states)
   - Positive developer feedback on API clarity
   - No loss of flexibility for complex cards

### General Guidelines

1. **Prefer Composition Over Abstraction**
   - Only extract when there is clear, repeated boilerplate with minimal variance
   - When in doubt, leave as domain-specific components that compose primitives

2. **Semantic Meaning Is Paramount**
   - Components must answer "What is this?" not "How is this styled?"
   - Good: GridTileCard, ConfirmDialog, ListScreenLayout
   - Bad: FlexRow, ActionButtonGroup, StyledDiv

3. **Monitor, Don't Over-Engineer**
   - Track rejected patterns as the codebase evolves
   - Re-evaluate if instance counts or variance changes significantly

4. **Validate with Real Usage**
   - Implement a prototype and test with 1-2 real instances before full migration
   - Get developer feedback early to avoid building the wrong abstraction

---

## Appendix: Verification Commands

Run these commands to re-verify pattern counts as the codebase evolves:

```bash
# Grid tile cards
find src/components -name '*-card.tsx' -o -name '*card.tsx' | grep -E '(type|seller|box|kit|part|overview)'

# Dialog files
find src/components -name '*dialog*.tsx' | grep -v 'src/components/ui/dialog.tsx'

# List components
find src/components -name '*-list.tsx' -o -name '*-overview-list.tsx'

# Layout usage
grep -r 'ListScreenLayout\|DetailScreenLayout\|FormScreenLayout' src/ --include="*.tsx" | wc -l

# Description list usage
grep -r 'DescriptionList\|DescriptionItem' src/ --include="*.tsx" | wc -l

# Confirm dialog usage
grep -r 'ConfirmDialog' src/ --include="*.tsx" | wc -l
```

---

## Next Steps

1. **Review this backlog with the team** to decide whether GridTileCard extraction is worthwhile
2. **If proceeding with GridTileCard:**
   - Design the API (recommend render slots pattern)
   - Prototype with TypeCard or SellerCard (simplest cases)
   - Validate with team before full migration
3. **If deferring GridTileCard:**
   - Document decision in this file
   - Revisit if pain points emerge (e.g., new entity types added frequently)
4. **Continue monitoring rejected patterns** for changes in instance counts or variance

---

**Catalog Confidence:** High

The research was thorough, verified multiple instances of each pattern, and applied strict semantic meaning filters. The main uncertainty is whether GridTileCard extraction provides sufficient ROI given the API variance. This decision should be made collaboratively with the team based on current pain points and future roadmap.
