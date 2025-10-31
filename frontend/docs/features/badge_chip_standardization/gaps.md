# Badge Chip Standardization - Remaining Gaps

This document tracks unmigrated badges identified after the initial badge chip standardization implementation (completed slices 1-5).

## Summary

- **Total unmigrated badges**: ~20-25 instances across 10 component files
- **High priority**: 13 badges (clear status or key-value metrics)
- **Medium priority**: 4 badges (could benefit from standardization)
- **Low priority**: 3-5 badges (informational labels, keep as is)

---

## High Priority Migrations

### 1. Shopping Lists - Overview Card
**File**: `src/components/shopping-lists/overview-card.tsx`

#### Status Badge (line 64-70)
- **Current**: `Badge` with variant mapping (default/secondary/outline)
- **Displays**: "Concept", "Ready", "Completed"
- **Should migrate to**: `StatusBadge`
- **Mapping**:
  - concept → StatusBadge status="concept"
  - ready → StatusBadge status="ready"
  - done → StatusBadge status="done"

#### New Lines Badge (line 76-83)
- **Current**: `Badge` with `outline` variant + `bg-slate-100 text-slate-700`
- **Displays**: "New {count}"
- **Should migrate to**: `KeyValueBadge`
- **Proposed**: `label="New"`, `value={lineCounts.new}`, `color="neutral"` or `"info"`

#### Ordered Lines Badge (line 84-91)
- **Current**: `Badge` with `outline` variant + `bg-amber-100 text-amber-800`
- **Displays**: "Ordered {count}"
- **Should migrate to**: `KeyValueBadge`
- **Proposed**: `label="Ordered"`, `value={lineCounts.ordered}`, `color="warning"`

#### Completed Lines Badge (line 92-99)
- **Current**: `Badge` with `outline` variant + `bg-emerald-100 text-emerald-800`
- **Displays**: "Completed {count}"
- **Should migrate to**: `KeyValueBadge`
- **Proposed**: `label="Completed"`, `value={lineCounts.done}`, `color="success"`

---

### 2. Shopping Lists - Concept Line Row
**File**: `src/components/shopping-lists/concept-line-row.tsx`

#### Status Badge (line 67-74)
- **Current**: `Badge` with variant mapping
- **Displays**: "New", "Ordered", "Done"
- **Should migrate to**: `StatusBadge`
- **Mapping**:
  - new → StatusBadge status="new" (uses "concept" color group)
  - ordered → StatusBadge status="ordered" (needs mapping definition)
  - done → StatusBadge status="done"

**Note**: The "ordered" status may need to be added to StatusBadge's STATUS_COLOR_MAP, or mapped to an existing status like "active" or "ready".

#### Seller Badge (line 53-60)
- **Current**: `Badge` with `outline` variant
- **Displays**: Seller name
- **Recommendation**: **Keep as is** (informational label, not a metric or status)

---

### 3. Shopping Lists - Ready Line Row
**File**: `src/components/shopping-lists/ready/ready-line-row.tsx`

#### Status Badge (line 147-154)
- **Current**: `Badge` with variant mapping
- **Displays**: "New", "Ordered", "Completed"
- **Should migrate to**: `StatusBadge`
- **Mapping**:
  - new → StatusBadge status="concept" (planning phase)
  - ordered → StatusBadge status="active" or "ready"
  - done → StatusBadge status="completed"

---

### 4. Shopping Lists - Update Stock Dialog
**File**: `src/components/shopping-lists/ready/update-stock-dialog.tsx`

#### Status Badge (line 571-573)
- **Current**: `Badge` with conditional variant (secondary/outline)
- **Displays**: "Ordered" or "Received"
- **Should migrate to**: `StatusBadge`
- **Mapping**:
  - ordered → StatusBadge status="active" or "ready"
  - received → StatusBadge status="completed"

---

### 5. Link Chips

#### Shopping List Link Chip
**File**: `src/components/shopping-lists/shopping-list-link-chip.tsx`

**Status Badge (line 114-122)**
- **Current**: `Badge` with conditional variant
- **Displays**: Shopping list status ("Concept", "Ready", "Done")
- **Should migrate to**: `StatusBadge`
- **Mapping**:
  - concept → StatusBadge status="concept"
  - ready → StatusBadge status="ready"
  - done → StatusBadge status="done"

#### Kit Link Chip
**File**: `src/components/kits/kit-link-chip.tsx`

**Status Badge (line 67-73)**
- **Current**: `Badge` with conditional variant
- **Displays**: Kit status ("Active", "Archived")
- **Should migrate to**: `StatusBadge`
- **Mapping**:
  - active → StatusBadge status="active"
  - archived → StatusBadge status="archived"

---

### 6. Kits - Kit Card
**File**: `src/components/kits/kit-card.tsx`

#### Archived Status Badge (line 119-121)
- **Current**: `Badge` with `outline` variant
- **Displays**: "Archived" (uppercase)
- **Should migrate to**: `StatusBadge`
- **Mapping**: archived → StatusBadge status="archived"
- **Note**: Currently uses `className="uppercase tracking-wide text-xs"` for styling

#### Shopping List Status Badges in Tooltip (line 224-229)
- **Current**: `Badge` with conditional variant (default/secondary)
- **Displays**: Shopping list status in membership tooltip
- **Should migrate to**: `StatusBadge`
- **Context**: Rendered inside `renderKitShoppingTooltip` function
- **Mapping**:
  - ready → StatusBadge status="ready"
  - other statuses → StatusBadge status="concept"

#### Pick List Status Badges in Tooltip (line 280-282)
- **Current**: `Badge` with `secondary` variant
- **Displays**: Pick list status in membership tooltip
- **Should migrate to**: `StatusBadge`
- **Context**: Rendered inside `renderKitPickTooltip` function
- **Mapping**: Uses `membership.status` → StatusBadge status="open" or status="completed"

---

## Medium Priority Migrations

### 7. Kits - Pick List Panel
**File**: `src/components/kits/kit-pick-list-panel.tsx`

#### Open Pick List Badge (line 171-173)
- **Current**: `Badge` with `secondary` variant + custom `bg-amber-100 text-amber-800`
- **Displays**: "Open"
- **Could migrate to**: `StatusBadge` with status="open"
- **Note**: Currently uses amber colors that match KeyValueBadge's warning color, but represents a status

---

### 8. Parts - Part Details
**File**: `src/components/parts/part-details.tsx`

#### Type Badge (line 261)
- **Current**: `Badge` with `secondary` variant
- **Displays**: "Type: {typename}"
- **Could migrate to**: `KeyValueBadge`
- **Proposed**: `label="Type"`, `value={part.type?.name ?? 'Unassigned'}`, `color="neutral"`
- **Consideration**: Currently includes fallback text "Unassigned" when no type is set

---

### 9. Boxes - Box Details
**File**: `src/components/boxes/box-details.tsx`

#### Capacity Badge (line 176)
- **Current**: `Badge` with `secondary` variant
- **Displays**: "Capacity: {capacity}"
- **Could migrate to**: `KeyValueBadge`
- **Proposed**: `label="Capacity"`, `value={box.capacity}`, `color="neutral"`

#### Usage Badge (line 177-179)
- **Current**: `Badge` with conditional variant (destructive/outline)
- **Displays**: "Usage: {percentage}%"
- **Could migrate to**: `KeyValueBadge` with dynamic color
- **Proposed**:
  - `label="Usage"`, `value="{usageStats.usagePercentage}%"`
  - `color="danger"` when ≥90%, otherwise `color="neutral"`
- **Challenge**: KeyValueBadge doesn't currently support dynamic color based on value thresholds

---

## Low Priority / Keep As Is

### 10. Kits - BOM Table
**File**: `src/components/kits/kit-bom-table.tsx`

#### Loading State Badges
- **"Saving…"** and **"Removing…"** badges with spinner icons
- **Recommendation**: **Keep as is**
- **Rationale**: Transient UI state indicators, not data metrics or entity status

---

### 11. Parts - AI Document Preview
**File**: `src/components/parts/ai-document-preview.tsx`

#### Document Type Badge
- **Current**: `Badge` with `secondary` variant
- **Displays**: Document type ("Datasheet", "Image", etc.)
- **Recommendation**: **Keep as is**
- **Rationale**: Simple category label without key-value structure

---

## Implementation Considerations

### 1. Status Mapping Extensions

The current `StatusBadge` supports these status values:
- `concept`, `ready`, `active`, `open`, `done`, `archived`, `completed`

**May need to add or map**:
- `ordered` → Could map to `active` or `ready` (work in progress)
- `new` → Could map to `concept` (planning phase)

### 2. StatusBadge Enhancements

Some badges use custom styling that StatusBadge doesn't currently support:
- **Uppercase styling**: Kit Card's "Archived" badge uses `className="uppercase tracking-wide text-xs"`
- **Custom capitalization**: Many badges use `className="capitalize"`

**Options**:
1. Add `capitalize` prop to StatusBadge
2. Add className pass-through to StatusBadge
3. Accept that StatusBadge uses its own label formatting

### 3. KeyValueBadge Dynamic Color

The Box Details usage badge changes color based on threshold (≥90% = red):
```tsx
<Badge variant={usageStats.usagePercentage >= 90 ? 'destructive' : 'outline'}>
  Usage: {usageStats.usagePercentage}%
</Badge>
```

**Options**:
1. Keep this as a plain Badge (not worth migrating)
2. Add conditional color logic in the component
3. Extend KeyValueBadge to accept dynamic color prop

### 4. Test Impact

All badge migrations will require test updates:
- Update assertions for new badge format (with colons for KeyValueBadge)
- Update test selectors if badge structure changes
- Verify tooltip text and accessibility labels

---

## Migration Roadmap

### Phase 1: High-Priority Status Badges (Est: 1-2 hours)
1. Shopping Lists Overview Card status badge
2. Line row status badges (concept + ready)
3. Update Stock Dialog status badge
4. Link chip status badges (2 components)
5. Kit Card status badges (3 locations)

**Test files to update**:
- `tests/e2e/shopping-lists/*.spec.ts`
- `tests/e2e/kits/*.spec.ts`

### Phase 2: High-Priority Key-Value Badges (Est: 1 hour)
1. Shopping Lists Overview Card line count badges (3 badges)

**Test files to update**:
- `tests/e2e/shopping-lists/*.spec.ts` (overview card tests)

### Phase 3: Medium-Priority Badges (Est: 1-2 hours)
1. Pick List Panel "Open" badge
2. Parts Type badge
3. Boxes Capacity/Usage badges

**Test files to update**:
- `tests/e2e/kits/kit-detail.spec.ts` (pick list panel)
- `tests/e2e/parts/*.spec.ts` (if part detail tests exist)
- `tests/e2e/boxes/*.spec.ts` (if box detail tests exist)

### Phase 4: Review and Document (Est: 30 minutes)
1. Update badge chip standardization plan with completion status
2. Document any badges intentionally left as plain Badge components
3. Update component documentation

---

## Success Criteria

- [ ] All status indicators use `StatusBadge` with consistent colors
- [ ] All key-value metrics use `KeyValueBadge` with semantic colors
- [ ] Plain `Badge` import is only used for:
  - Informational labels (seller names, document types)
  - Transient state indicators (loading, saving)
- [ ] All affected Playwright tests pass with updated assertions
- [ ] TypeScript compilation succeeds with no errors
- [ ] ESLint passes with no warnings

---

## Open Questions

1. Should "ordered" status map to `active`, `ready`, or get its own color definition?
2. Should StatusBadge support custom styling (uppercase, extra classes)?
3. Is dynamic color for threshold-based badges (like usage ≥90%) in scope?
4. Should seller badges and document type badges be migrated for consistency, even if not metrics?

---

**Document Version**: 1.0
**Last Updated**: 2025-10-27
**Status**: Pending review
