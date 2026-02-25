# Seller Links Migration -- Plan Review

## 1) Summary & Decision

**Readiness**

The plan is thorough, well-researched, and implementation-ready. It demonstrates strong codebase knowledge with line-level evidence for every affected file. All 17 required sections are present. The updated plan addresses the cross-domain `AddToShoppingListDialog` dependency, specifies the fuzzy search multi-seller expansion pattern, defines the test factory method for seller link creation, clarifies the query invalidation approach, and promotes the seller chip overflow cap to a firm design decision. No blockers or major issues remain.

**Decision**

`GO` -- The plan is comprehensive, well-evidenced, and addresses all identified risks. Implementation can proceed following the defined slices.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` -- Pass -- All 17 required sections (0-16) are present and follow the prescribed templates. The user requirements checklist in section 1a is included verbatim.
- `docs/product_brief.md` -- Pass -- `plan.md:51-54` -- The product brief describes "Seller and seller product page link (single set)" in section 5. The migration to multi-seller links is a natural evolution. The plan correctly scopes out pricing and reorder thresholds (brief section 4).
- `docs/contribute/architecture/application_overview.md` -- Pass -- `plan.md:167` -- The plan correctly documents the snake_case consumption pattern and notes a camelCase alternative if a custom hook is added, consistent with the architecture doc.
- `docs/contribute/testing/playwright_developer_guide.md` -- Pass -- `plan.md:510-530` -- The test plan now includes a factory method definition for `createPartSellerLink` with code sketch, fulfilling the API-first data setup principle. All test surfaces have scenarios, instrumentation, and backend coordination documented.

**Fit with codebase**

- `AddToShoppingListDialog` / `partSummary.defaultSellerId` -- `plan.md:138-140,326-331` -- The plan now includes `add-to-shopping-list-dialog.tsx` in the affected areas and documents the `defaultSellerId: null` post-migration behavior in the derived state section. The dialog handles `null` gracefully at line 65 (`sellerId: part.defaultSellerId ?? undefined`).
- Generated hooks `invalidateQueries()` -- `plan.md:423` -- The plan now correctly documents that the blanket `invalidateQueries()` is acceptable for initial implementation and specifies the `onSuccess` override pattern for future scoped invalidation.
- Fuzzy search multi-seller matching -- `plan.md:264-285,305-310` -- The plan now includes explicit pseudocode for the `seller_links.map()` expansion in both `part-list.tsx` and `use-parts-selector.ts`, referencing the existing tags expansion as the template pattern.
- Test factory method -- `plan.md:510-530,556-559` -- The plan now defines `createPartSellerLink(partKey, sellerId, link)` with a TypeScript code sketch and establishes it as a prerequisite for all Playwright specs.

---

## 3) Open Questions & Ambiguities

No open questions remain. All previously identified ambiguities have been resolved in the updated plan:

- `defaultSellerId` handling: resolved as `null` post-migration (`plan.md:326-331`).
- Fuzzy search expansion pattern: resolved with explicit pseudocode (`plan.md:264-285`).
- Query invalidation approach: resolved as blanket invalidation acceptable (`plan.md:423`).

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Part list card seller display
- Scenarios:
  - Given a part with seller links created via `testData.sellers.createPartSellerLink()`, When the part list loads, Then seller name chips are visible on the card (`tests/e2e/parts/part-list.spec.ts`)
  - Given a part with no seller links, When the part list loads, Then no seller elements appear on the card
- Instrumentation: `data-testid="parts.list.card.seller-links"`, `data-testid="parts.list.card.seller-chip"`
- Backend hooks: `SellerTestFactory.createPartSellerLink(partKey, sellerId, link)` defined in `plan.md:515-528`
- Gaps: Logo image testing deferred until `logo_url` backend addition (justified).
- Evidence: `plan.md:469-475`

- Behavior: Part details seller links section
- Scenarios:
  - Given a part with seller links, When the detail screen loads, Then "Seller Information" section shows each seller name and link
  - Given a part with no seller links, When the detail screen loads, Then no seller section is rendered
- Instrumentation: `data-testid="parts.detail.seller-links"`, `data-testid="parts.detail.seller-link-item"`
- Backend hooks: Same factory method
- Gaps: None.
- Evidence: `plan.md:477-483`

- Behavior: Part form seller link CRUD (edit mode)
- Scenarios:
  - Given a part in edit mode, When user adds a seller link, Then the link appears and `FormTestEvent` fires
  - Given a part with an existing seller link, When user removes it, Then the link disappears and `FormTestEvent` fires
  - Given create mode, Then placeholder message is shown
- Instrumentation: `data-testid="parts.form.seller-links.add"`, `data-testid="parts.form.seller-links.remove"`, `FormTestEvent` scopes
- Backend hooks: Same factory method for seeding initial seller links
- Gaps: None.
- Evidence: `plan.md:485-492`

- Behavior: AI cleanup seller removal
- Scenarios:
  - Given AI cleanup runs, Then merge table does not include Seller or Seller Link rows
- Instrumentation: Absence assertion on `data-field="seller"` / `data-field="sellerLink"`
- Backend hooks: Existing AI cleanup SSE mock
- Gaps: None.
- Evidence: `plan.md:494-500`

- Behavior: Seller link test factory helper
- Scenarios:
  - Given a part and seller, When `createPartSellerLink()` is called, Then seller link is created via POST
- Instrumentation: Standard factory API calls
- Backend hooks: `POST /api/parts/{part_key}/seller-links`
- Gaps: None.
- Evidence: `plan.md:510-530`

---

## 5) Adversarial Sweep (must find >=3 credible issues or declare why none exist)

- Checks attempted:
  1. Cross-domain ripple from `defaultSellerId` removal -- `plan.md:138-140,326-331` -- The plan now explicitly lists `add-to-shopping-list-dialog.tsx` as an affected area and documents the `null` fallback behavior. The dialog code at line 65 confirms graceful handling.
  2. Fuzzy search single-seller regression -- `plan.md:264-285,305-310` -- The plan now includes explicit pseudocode for the `.map()` expansion pattern, referencing the existing tags pattern as a template. The invariant is clear.
  3. Test factory missing seller link creation method -- `plan.md:510-530,556-559` -- The plan now defines the `createPartSellerLink` method with a TypeScript code sketch and establishes slice ordering.
  4. Query invalidation blanket vs scoped -- `plan.md:423` -- The plan now documents that blanket invalidation is acceptable and specifies the override pattern for future optimization.
  5. Part card visual overflow with many seller links -- `plan.md:259,577-579` -- The plan now includes a firm cap of 3 displayed chips with "+N" overflow indicator.
- Evidence: All plan sections referenced above.
- Why the plan holds: All five previously identified fault lines have been addressed with explicit text, pseudocode, or design decisions. No new credible issues found.

---

## 6) Derived-Value & State Invariants (table)

- Derived value: **Seller names for fuzzy search** (part list and part selector)
  - Source dataset: `part.seller_links` array (unfiltered) from parts list query, expanded via `.map(sl => ({ term: sl.seller_name ?? '', type: 'text' as const }))`
  - Write / cleanup triggered: Read-only; drives fuzzy filter predicate
  - Guards: `seller_links ?? []` fallback; empty array produces zero search terms
  - Invariant: A search for any seller name associated with a part must return that part. Each seller name is an independent search term.
  - Evidence: `plan.md:264-285,305-310`

- Derived value: **Part form seller links display list**
  - Source dataset: `existingPart.seller_links` from `useGetPartsByPartKey` query (unfiltered)
  - Write / cleanup triggered: POST/DELETE mutations invalidate queries; re-fetch updates the list
  - Guards: Only shown in edit mode; create/duplicate modes show placeholder
  - Invariant: The displayed list must always reflect server state after mutation settlement. No optimistic updates.
  - Evidence: `plan.md:312-317`

- Derived value: **`partSummary.defaultSellerId`** (part details -> shopping list dialog)
  - Source dataset: Post-migration, always `null`
  - Write / cleanup triggered: Drives initial seller selection in `AddToShoppingListDialog` form
  - Guards: Dialog handles `null` gracefully (seller dropdown starts empty)
  - Invariant: Post-migration, `defaultSellerId` must be `null`. The shopping list dialog must not error or pre-select an incorrect seller.
  - Evidence: `plan.md:326-331`

- Derived value: **AI cleanup field changes list** (post-seller removal)
  - Source dataset: `currentPart` fields compared to `cleanedPart` fields
  - Write / cleanup triggered: Checked fields drive the PUT payload
  - Guards: Seller/sellerLink fields removed from comparison
  - Invariant: Field changes array contains only fields present on both current and cleaned part models
  - Evidence: `plan.md:333-338`

---

## 7) Risks & Mitigations (top 3)

- Risk: Backend `logo_url` field not ready in time, causing all seller display to fall back to name chips. This is a visual degradation, not a functional issue.
- Mitigation: Design the logo/chip rendering with `logo_url` optional from day one. Chip fallback is the default. Logos appear automatically once backend ships the field.
- Evidence: `plan.md:565-567`

- Risk: SSE cleanup payload still includes seller fields after backend changes, potentially causing transform errors if fields are destructured.
- Mitigation: Since seller handling is stripped entirely, the fields are not read at all. Defensive transforms only access expected fields.
- Evidence: `plan.md:569-571`

- Risk: Multiple seller links cluttering part cards in list view.
- Mitigation: Firm cap of 3 displayed chips with "+N" overflow indicator (section 5, step 6).
- Evidence: `plan.md:259,577-579`

---

## 8) Confidence

Confidence: High -- The updated plan addresses all previously identified issues. The affected areas are exhaustive (including the cross-domain `AddToShoppingListDialog`), the fuzzy search pattern is explicitly specified with pseudocode, the test factory method is defined with a code sketch, and all design decisions (overflow cap, query invalidation, `defaultSellerId` behavior) are documented. The plan is implementation-ready.
