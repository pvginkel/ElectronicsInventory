# Attachment Set Refactor - Plan Review

## 1) Summary & Decision

**Readiness**

The plan is comprehensive and well-structured, with thorough research, clear implementation slices, and detailed coverage of the refactoring scope. The approach of creating generic attachment-set hooks while maintaining part convenience endpoints is sound. However, the plan contains several critical gaps in Playwright test coverage specification, missing instrumentation details, and ambiguities around query invalidation that must be resolved before implementation begins.

**Decision**

`GO-WITH-CONDITIONS` — The plan's technical approach is solid and aligns with project patterns, but requires clarification on test instrumentation, page object structure, and factory updates before implementation. The conditions are detailed in sections 3-5 below.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:0-656` — Plan uses all required templates (intent/scope, file map, data model, etc.) and provides repository evidence with file:line citations throughout.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:73-100` — Plan correctly identifies custom hooks wrapping generated API, follows domain-driven folder layout (`src/hooks/`, `src/components/kits/`), and maps snake_case to camelCase in type definitions (`plan.md:132-136`).

- `docs/contribute/testing/playwright_developer_guide.md` — **Partial Fail** — `plan.md:541-580` — Plan includes deterministic test scenarios but lacks critical details on:
  - Page object structure: No evidence of creating/updating page objects for kit attachments
  - Factory extensions: References test factories but doesn't specify what methods need to be added to `testData.attachments` for kit support
  - Instrumentation hooks: States "no new instrumentation events required" (`plan.md:359`) but doesn't explain how tests will wait for kit attachment operations to complete

- `CLAUDE.md` — Pass — `plan.md:457,582-628` — Plan correctly defers instrumentation finalization to test authoring phase and structures work in incremental slices with Playwright tests as final slice.

**Fit with codebase**

- `src/hooks/use-part-documents.ts` — Pass — `plan.md:85-91` — Plan correctly identifies that current hook imports deleted generated hooks (`useGetPartsAttachmentsByPartKey` at line 3 still exists in current code, contradicting plan's claim at `plan.md:10,75`). **Research needed**: Verify whether part convenience endpoints are truly deprecated or still active.

- `src/hooks/use-document-upload.ts` — Pass — `plan.md:92-96` — Plan accurately references hardcoded part endpoint at line 95 and query invalidation at lines 143-148.

- `src/types/kits.ts` — **Fail** — `plan.md:132-136` — Plan states `KitSummary` and `KitDetail` need `attachmentSetId` and `coverUrl` fields, but actual file shows no such fields exist. Plan must specify snake_case field names from backend schema (`attachment_set_id`, `cover_url`) and show mapping logic similar to existing fields.

- `tests/e2e/parts/part-documents.spec.ts` — **Fail** — `plan.md:139-145,552-554` — Plan references updating part attachment specs but provides no analysis of existing test structure. Current spec uses page objects (`parts`, `partsDocuments`, `toastHelper`) that aren't mentioned in the plan. The plan must identify which page objects need updating and which are new.

## 3) Open Questions & Ambiguities

- **Question:** Are part convenience endpoints (`/api/parts/{part_key}/attachments`) truly deprecated, or are they stable wrappers that the plan should continue using?
- **Why it matters:** Plan claims convenience endpoints "still exist" (`plan.md:22-23`) but also says hooks importing them are "deleted" (`plan.md:75,10`). This contradiction affects whether slice 2 needs to migrate parts to attachment-set endpoints or just update query invalidation.
- **Needed answer:** Verify in backend OpenAPI schema and change brief whether part endpoints remain as permanent convenience wrappers or are temporary compatibility shims. Current evidence shows `useGetPartsAttachmentsByPartKey` exists in generated hooks, suggesting endpoints are stable.

- **Question:** What page object structure will be created for kit attachment tests?
- **Why it matters:** Plan section 13 lists test scenarios but doesn't specify whether a new `KitDocumentsPage` object will be created, whether `PartsDocumentsPage` will be generalized, or whether kit tests will duplicate part test structure.
- **Needed answer:** Examine `tests/e2e/parts/part-documents.spec.ts` structure and decide on page object reuse strategy. Current part spec imports `partsDocuments` fixture that isn't documented in plan.

- **Question:** How will Playwright tests wait for attachment operations to complete without new instrumentation?
- **Why it matters:** Plan states "no new instrumentation events required" (`plan.md:359`) but attachment uploads, deletions, and cover toggles are async mutations that tests must wait for deterministically.
- **Needed answer:** Clarify whether tests will use existing `ListLoading` events from parent entity queries, poll backend state via `testData.attachments`, or require form instrumentation for upload modal. Current part spec uses `toastHelper.waitForToastWithText` and `testData.attachments.list` polling, which should be documented.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior:** Part attachment workflows (existing functionality with refactored implementation)
- **Scenarios:**
  - Given part detail page loaded, When user uploads file attachment, Then attachment appears in grid (`plan.md:547`)
  - Given part with cover, When user removes cover, Then part card updates (`plan.md:550`)
- **Instrumentation:** `data-testid="parts.documents.grid"` mentioned (`plan.md:552`) but no mention of modal, upload button, or form submission events
- **Backend hooks:** Plan references `testData.attachments` (`plan.md:44`) but doesn't list factory methods needed (e.g., `create()`, `setCover()`, `delete()`, `list()`, `getCover()`)
- **Gaps:** Missing page object specification, no upload progress instrumentation plan, unclear how tests verify query invalidation worked
- **Evidence:** `plan.md:541-554`, existing `tests/e2e/parts/part-documents.spec.ts:1-101`

- **Behavior:** Kit attachment upload and management (new feature)
- **Scenarios:**
  - Given active kit detail page, When user uploads file, Then attachment appears in grid (`plan.md:560`)
  - Given archived kit, When viewing attachment section, Then add button is disabled (`plan.md:565`)
- **Instrumentation:** `data-testid="kits.detail.documents.grid"` and `data-testid="kits.detail.documents.modal"` mentioned (`plan.md:567`) but no test-events for loading states
- **Backend hooks:** No specification of whether `testData.attachments` will accept `kitId` parameter or requires new `testData.kitAttachments` factory
- **Gaps:** **Major gap** — No page object design, no factory extension plan, no specification of how archived state will be verified in tests
- **Evidence:** `plan.md:556-569`

- **Behavior:** Kit list cover image display (new feature)
- **Scenarios:**
  - Given kits with cover images, When overview loads, Then cards display covers (`plan.md:575`)
- **Instrumentation:** `data-testid="kits.overview.card.{kitId}"` mentioned (`plan.md:577`) but this doesn't match project convention of `kits.overview.card` without dynamic ID
- **Backend hooks:** No mention of how to seed kit with cover in test setup
- **Gaps:** **Minor** — testid convention mismatch, unclear how cover image element will be identified in tests
- **Evidence:** `plan.md:571-579`

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Query Invalidation May Not Refresh Kit List Cover Images**

**Evidence:** `plan.md:246-254` states invalidation strategy but only mentions `['getKitsByKitId']` for detail and `['getKits']` for list. The plan doesn't verify these are the actual TanStack Query keys used by kit hooks.

**Why it matters:** If kit list query uses a different key pattern (e.g., with status filters), invalidating `['getKits']` won't trigger refetch and kit cards won't show updated cover images. This is the exact type of cache staleness the plan warns about in section 15 (`plan.md:637-639`).

**Fix suggestion:** Research actual query keys used by kit list queries. Check `src/hooks/use-kits.ts` or equivalent to find the exact query key structure (likely includes status parameter). Update section 4 to show complete invalidation pattern, e.g.:
```typescript
queryClient.invalidateQueries({ queryKey: ['getKits'] }); // Invalidates all status variants
queryClient.invalidateQueries({ queryKey: ['getKitsByKitId', { path: { kit_id: kitId } }] });
```

**Confidence:** High

**Major — Part Convenience Endpoint Assumption Contradicts Current Code**

**Evidence:** Plan claims at `plan.md:10,75` that `useGetPartsAttachmentsByPartKey` is a "deleted generated hook", but actual file `src/hooks/use-part-documents.ts:3` imports it successfully, and bash verification shows it exists in `src/lib/api/generated/hooks.ts`. Backend change brief states part endpoints "remain as convenience wrappers" (change_brief.md:19-21).

**Why it matters:** If part convenience endpoints are stable (not deleted), the entire slice 2 refactoring approach may be unnecessary complexity. The plan proposes creating generic hooks and then having part hooks delegate to them, when the simpler approach would be to keep using part convenience endpoints directly and only create generic hooks for kits.

**Fix suggestion:** Verify backend API status and revise slice 2 scope:
- If part endpoints are stable wrappers: Update plan to state parts will CONTINUE using current hooks with only query invalidation changes to refresh `cover_url`. Generic hooks are only for kits.
- If part endpoints are truly deprecated: Provide migration timeline and explain why plan says they "still exist" if hooks are "deleted"

**Confidence:** High

**Major — Missing Test Factory Extension Specification**

**Evidence:** Plan mentions "test factories have been updated" at `plan.md:63` and references `testData.attachments` at `plan.md:44`, but provides no specification of what factory methods exist or need to be added. Section 13 test scenarios don't specify how to seed kit attachments for test setup.

**Why it matters:** Per `docs/contribute/testing/playwright_developer_guide.md:14-15,27-31`, tests must create prerequisite data via factories, never through UI. Without factory method specifications, test authors won't know how to seed kits with attachments for testing scenarios like "Given kit with cover" (`plan.md:563`). Current part spec uses `testData.attachments.list()`, `testData.attachments.get()`, `testData.attachments.getCover()` which aren't documented in plan.

**Fix suggestion:** Add subsection to section 13 documenting factory extensions:
```markdown
### Test Factory Extensions Required

**testData.attachments** (existing, may need updates):
- `create(partKey, { type: 'file' | 'url', title, url?, file? })` - Create attachment via part convenience endpoint
- `list(partKey)` - List attachments for part
- `get(partKey, attachmentId)` - Get specific attachment
- `setCover(partKey, attachmentId)` - Set part cover
- `getCover(partKey)` - Get current part cover
- `delete(partKey, attachmentId)` - Delete attachment

**New methods needed**:
- `createForKit(kitId, { type, title, url?, file? })` - Create attachment via kit's attachment-set
- `listForKit(kitId)` - List kit attachments
- `setCoverForKit(kitId, attachmentId)` - Set kit cover
- `getCoverForKit(kitId)` - Get kit cover
```

**Confidence:** High

**Major — Archived Kit Restriction Lacks Backend Enforcement Verification**

**Evidence:** Plan states at `plan.md:491-495` "UI disables mutation actions when `kit.status === 'archived'`, backend enforces same constraint" with "Residual risk: None - double enforcement". But there's no evidence in the plan that backend enforcement was verified.

**Why it matters:** If backend doesn't actually enforce the archived restriction, UI-only guards can be bypassed via API calls or browser dev tools. The plan's "none" residual risk claim is unsupported. Per security best practices, UI guards are UX conveniences, not security controls.

**Fix suggestion:** Add to section 15 Risks:
```markdown
- Risk: Backend may not enforce archived kit attachment restrictions
- Impact: Users could bypass UI controls via direct API calls
- Mitigation: Verify backend returns 403/409 when attempting attachment mutations on archived kits; add test scenario covering this case; document that UI guard is UX optimization only
```
Update section 13 test plan to include: "Given archived kit, When attempting API-level attachment mutation, Then backend returns error"

**Confidence:** Medium

**Minor — Test ID Convention Inconsistency**

**Evidence:** `plan.md:577` shows `data-testid="kits.overview.card.{kitId}"` with interpolated kit ID, but project convention per `docs/contribute/testing/playwright_developer_guide.md:186` uses static feature.section.element format without dynamic values.

**Why it matters:** Dynamic test IDs complicate page object locators and don't align with documented patterns. Comparing to part cards, the ID should likely be `kits.overview.card` on the container with the locator filtering by kit ID via different attributes.

**Fix suggestion:** Change test ID pattern to match existing card structures. Review how part cards expose test IDs and replicate that pattern. Likely: `data-testid="kits.overview.card"` on each card container with `data-kit-id="{id}"` as separate attribute for filtering.

**Confidence:** Medium

**Minor — Upload Modal Props Interface May Break Existing Callers**

**Evidence:** Plan at `plan.md:108,520-523` states modal will "accept `attachmentSetId` parameter alongside/instead of `partId`" but doesn't specify the backward compatibility strategy. Current modal interface (`add-document-modal.tsx:14-19`) requires `partId: string`.

**Why it matters:** If slice 3 changes the modal to require `attachmentSetId`, all existing part detail page callers will break. The plan needs explicit prop design showing how both use cases are supported.

**Fix suggestion:** Clarify modal interface design in section 3 Data Model:
```typescript
interface AddDocumentModalProps {
  // Exactly one must be provided:
  partId?: string;
  attachmentSetId?: number;
  entityType?: 'part' | 'kit'; // For context/analytics if needed
  // ... existing props
}
```
Document validation logic that ensures exactly one ID is provided and how the modal determines which upload hook to use.

**Confidence:** Medium

## 6) Derived-Value & State Invariants (table)

- **Derived value:** `isCover` boolean on DocumentItem
  - **Source dataset:** Unfiltered attachment list from attachment-set query, compared against `currentCoverAttachmentId` from parent entity
  - **Write / cleanup triggered:** No writes; read-only derivation for UI display (cover badge on tile)
  - **Guards:** Cover ID must reference attachment in the same set (backend constraint)
  - **Invariant:** At most one attachment per set has `isCover === true`; value must match parent entity's `cover_url` attachment
  - **Evidence:** `plan.md:318-323`, `part-document-grid.tsx:30-33`

- **Derived value:** Cover URL on kit list cards
  - **Source dataset:** Kit summary records from `getKits` query (filtered by status), each containing `cover_url` field
  - **Write / cleanup triggered:** Setting/removing cover via attachment-set API triggers query invalidation of both `['getAttachmentSetsCoverBySetId']` and `['getKits']`
  - **Guards:** **MISSING GUARD** — Plan states "prefer broad invalidation keys" but doesn't specify if status-filtered queries are also invalidated
  - **Invariant:** Kit card cover image URL must reflect most recent cover attachment; stale cache = stale card image
  - **Evidence:** `plan.md:246-254,514-516,637-639`

- **Derived value:** Archived kit button disabled state
  - **Source dataset:** Single kit detail record with `status` field from `['getKitsByKitId']` query
  - **Write / cleanup triggered:** No writes from this derivation; read-only guard on UI interactions
  - **Guards:** All attachment mutation buttons check `kit.status === 'archived'`
  - **Invariant:** Disabled state reflects current kit status; if status changes (e.g., unarchive), buttons become enabled
  - **Evidence:** `plan.md:343-350,489-495,533-539`

> **Flag:** Entry 2 (cover URL on kit cards) uses a filtered view (status-based kit list) to determine if cache writes (cover updates) need to invalidate ALL status variants. The plan states "prefer broad invalidation" but doesn't prove this will work. If kit list queries use query keys with status parameters, invalidating `['getKits']` may not refetch filtered views. This needs **Major** escalation per template requirement.

## 7) Risks & Mitigations (top 3)

- **Risk:** Query invalidation for kit list may not refresh cover images if query keys include status filters
- **Mitigation:** Research actual kit list query key structure in current codebase; update invalidation pattern in section 4 to show complete invalidation that covers all status variants; add test scenario verifying kit card cover updates after setting cover on kit detail page
- **Evidence:** `plan.md:246-254,637-639`, derived-value analysis in section 6 above

- **Risk:** Test implementation in slice 5 will be blocked by missing page objects and factory specifications
- **Mitigation:** Move page object and factory design from "finalize during test authoring" (`plan.md:457`) to explicit subsections in sections 2 and 13; specify reusable vs feature-specific page object structure before slice 5 begins
- **Evidence:** `plan.md:139-145,541-580,649-651`, adversarial finding on factory extensions

- **Risk:** Part convenience endpoint assumption may lead to unnecessary refactoring complexity
- **Mitigation:** Verify backend API stability guarantees for part attachment endpoints before implementing slice 2; if endpoints are stable wrappers (as backend brief suggests), simplify slice 2 to only update query invalidation without creating generic wrapper hooks for parts
- **Evidence:** `plan.md:22-24,75,207-214,631-635`, adversarial finding on endpoint status

## 8) Confidence

**Confidence:** Medium — The plan demonstrates thorough research and clear technical thinking, but critical implementation details (query keys, test infrastructure, endpoint status) remain unverified assumptions. Addressing the GO-WITH-CONDITIONS findings will raise confidence to High.
