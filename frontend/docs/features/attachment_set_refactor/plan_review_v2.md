# Attachment Set Refactor - Plan Review v2

## 1) Summary & Decision

**Readiness**

The updated plan successfully addresses all critical findings from the first review. The plan now includes comprehensive test infrastructure specifications (factory methods, page object structure, wait strategies), verified query invalidation patterns, clarified the part convenience endpoint strategy, documented archived kit backend enforcement expectations, corrected test ID conventions, and specified the upload modal backward compatibility design. The research log demonstrates thorough verification of key assumptions including query key prefix matching and existing hook availability.

**Decision**

`GO` — The plan is implementation-ready. All major conditions from the first review have been resolved with concrete evidence, the technical approach is sound and aligns with project patterns, and the test coverage specification is comprehensive and deterministic.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — `plan.md:1-840` — Plan uses all required templates with file:line evidence throughout, includes research log documenting discovery work (section 0), and provides complete data model, API surface, and test specifications.

- `docs/contribute/architecture/application_overview.md` — Pass — `plan.md:85-150` — Plan correctly identifies custom hooks wrapping generated API client, follows domain-driven folder layout, maps snake_case to camelCase in type definitions (lines 197-206), and reuses existing patterns from part implementation.

- `docs/contribute/testing/playwright_developer_guide.md` — Pass — `plan.md:569-679` — Plan now includes:
  - Detailed factory extension specification (lines 571-623) with method signatures for both part and kit attachment operations
  - Page object structure specification (lines 625-663) including new `KitDocumentGridPage` design and fixture registration
  - Test wait strategy (lines 665-679) using API response waiting, backend state polling, toast notifications, and existing instrumentation
  - Deterministic scenarios (lines 680-716) with Given/When/Then format and instrumentation hooks

- `docs/contribute/testing/index.md` — Pass — `plan.md:569-716,778-788` — Plan follows API-first data setup (factory extensions), real backend testing (no mocking), fresh data per test (randomized IDs in factories), and includes test coverage in implementation slices.

- `CLAUDE.md` — Pass — `plan.md:718-788` — Plan structures work in incremental slices with tests as the final slice (slice 5), includes verification steps per slice, and defers minor decisions to implementation phase while locking in critical patterns.

**Fit with codebase**

- `src/hooks/use-part-documents.ts` — **Corrected** — `plan.md:22-23,99-101` — Plan correctly identifies that generated hooks DO exist (`useGetPartsAttachmentsByPartKey` confirmed present in generated/hooks.ts), and clarifies that "frontend generated hooks were removed" is incorrect - the hooks exist and will be used. The confusion from the first review about "deleted hooks" has been resolved.

- `src/hooks/use-kits.ts` — **Verified** — `plan.md:25-31` — Plan includes verification of actual query key structure showing `['getKits', createKitsQueryParams(status, searchTerm)]` (line 25) and confirms TanStack Query prefix matching behavior with evidence from `use-kit-create.ts:41` showing existing `invalidateQueries({ queryKey: ['getKits'] })` usage.

- `tests/api/factories/attachment-factory.ts` — Pass — `plan.md:571-623` — Plan specifies complete factory extension with method signatures, parameter types, and implementation patterns for kit attachment operations. Reviewed existing factory (lines 1-211) confirms part methods exist and new kit methods follow same structure.

- `tests/support/page-objects/document-grid-page.ts` — Pass — `plan.md:625-663` — Plan identifies existing `DocumentGridPage` for parts (lines 1-164 confirmed) and specifies new `KitDocumentGridPage` following same pattern with kit-specific test IDs and parameters.

- `tests/e2e/parts/part-documents.spec.ts` — Pass — `plan.md:680-691` — Plan references existing part document tests and states they should continue passing after refactor, using them as a template for kit tests.

## 3) Open Questions & Ambiguities

All open questions from the first review have been resolved through research and documented in the plan:

- **Q:** Are part convenience endpoints stable or deprecated?
- **A:** RESOLVED — `plan.md:22-23` clarifies that backend endpoints remain as stable wrappers, and the frontend generated hooks exist and will be used. The confusion about "deleted hooks" has been corrected.

- **Q:** What page object structure will be created for kit attachment tests?
- **A:** RESOLVED — `plan.md:625-663` specifies `KitDocumentGridPage` extending the pattern from `DocumentGridPage` with kit-specific test IDs and fixture registration.

- **Q:** How will tests wait for attachment operations without new instrumentation?
- **A:** RESOLVED — `plan.md:665-679` documents wait strategy using API response waiting in page objects, backend state polling via test factories, toast helpers, and existing parent entity query events.

- **Q:** Will query invalidation refresh kit list cover images with status filters?
- **A:** RESOLVED — `plan.md:25-31` includes verification of TanStack Query prefix matching behavior, confirming `invalidateQueries({ queryKey: ['getKits'] })` matches all status-filtered queries.

No new open questions. All design decisions are documented with evidence.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior:** Part attachment workflows (refactored implementation)
- **Scenarios:**
  - Given part detail page loaded, When user uploads file attachment, Then attachment appears in grid and queries refetch (`plan.md:683-685`)
  - Given part with attachments, When user sets cover image, Then cover badge appears and part card shows cover (`plan.md:686`)
  - Given part with cover, When user removes cover, Then badge removed and card shows placeholder (`plan.md:687`)
  - Given part with attachment, When user deletes attachment, Then attachment removed from grid (`plan.md:688`)
- **Instrumentation:** `data-testid="parts.documents.grid"`, `data-testid="parts.documents.modal"`, API response waiting in page object methods (`plan.md:689`)
- **Backend hooks:** Factory methods `createUrl(partKey)`, `createBinary(partKey)`, `list(partKey)`, `setCover(partKey, attachmentId)`, `delete(partKey, attachmentId)` (`plan.md:571-580`)
- **Gaps:** None — complete coverage with existing test patterns
- **Evidence:** `plan.md:680-691`, existing `tests/e2e/parts/part-documents.spec.ts`

- **Behavior:** Kit attachment workflows (new feature)
- **Scenarios:**
  - Given active kit detail page, When user uploads file/URL, Then attachment appears in grid and kit queries refetch (`plan.md:696-697`)
  - Given kit with attachments, When user sets/removes cover, Then badge and card cover update (`plan.md:698-699`)
  - Given kit with attachment, When user deletes, Then removed from grid (`plan.md:700`)
  - Given archived kit, When viewing attachment section, Then add/delete/cover buttons disabled (`plan.md:701-702`)
- **Instrumentation:** `data-testid="kits.detail.documents.grid"`, `data-testid="kits.detail.documents.modal"`, API response waiting, backend state polling (`plan.md:704`)
- **Backend hooks:** Factory methods `createUrlForKit(kitId)`, `createBinaryForKit(kitId)`, `listForKit(kitId)`, `setCoverForKit(kitId, attachmentId)`, `deleteForKit(kitId, attachmentId)`, helper `getKitAttachmentSetId(kitId)` (`plan.md:582-623`)
- **Gaps:** None — comprehensive coverage including archived state verification
- **Evidence:** `plan.md:693-706`

- **Behavior:** Kit list cover display (new feature)
- **Scenarios:**
  - Given kits with cover images, When overview page loads, Then kit cards display cover images (`plan.md:712`)
  - Given kit without cover, When overview page loads, Then kit card shows placeholder (`plan.md:713`)
- **Instrumentation:** `data-testid="kits.overview.card"` with `data-kit-id` attribute for filtering (`plan.md:714`)
- **Backend hooks:** Factory methods to set cover via `setCoverForKit`, verify via kit list query (`plan.md:714`)
- **Gaps:** None — follows existing part card cover test patterns
- **Evidence:** `plan.md:708-716`

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**No credible issues remain — Previous major findings successfully resolved**

The first review identified 5 major/minor issues. All have been addressed:

- **Checks attempted:** Query invalidation coverage, part endpoint status verification, test factory completeness, archived kit backend enforcement, test ID conventions, upload modal backward compatibility
- **Evidence:**
  - Query invalidation: `plan.md:25-31` now includes verification of TanStack Query prefix matching with evidence from `use-kit-create.ts:41`
  - Part endpoint contradiction: `plan.md:22-23` clarifies endpoints exist and generated hooks exist, correcting the "deleted hooks" claim
  - Test factory specification: `plan.md:571-623` provides complete method signatures and implementation patterns
  - Archived kit enforcement: `plan.md:514-521` clarifies UI is UX convenience, backend is security enforcement, includes test scenario for backend rejection
  - Test ID convention: `plan.md:714` corrected to static `data-testid="kits.overview.card"` with separate `data-kit-id` attribute
  - Upload modal props: `plan.md:749-762` specifies explicit backward compatibility design with validation and mutually exclusive props
- **Why the plan holds:** Each previous finding has a corresponding update in the plan with concrete evidence from codebase research. The plan now demonstrates verification of assumptions rather than stating them without proof.

**Additional adversarial checks performed:**

1. **Cache invalidation race conditions** — `plan.md:435-441` addresses via TanStack Query's built-in deduplication, relies on framework behavior rather than custom handling. Risk is LOW and accepted.

2. **Cover attachment deletion handling** — `plan.md:443-449` documents backend automatically clears `cover_url` on parent entity, frontend reflects after query refetch. Covered by existing backend behavior.

3. **Network error recovery** — `plan.md:419-425` shows error handling via toast with retry option, leverages existing error parsing utilities. Standard pattern.

4. **Missing attachment set ID edge case** — `plan.md:403-409` includes defensive handling to disable section or show error if entity lacks `attachmentSetId`. Type guards prevent runtime issues.

5. **Upload validation boundaries** — `plan.md:411-417` references existing `validateFile` utility and URL validation before fetch. Existing infrastructure covers this.

All adversarial checks pass or are addressed with documented mitigations. No unresolved risks found.

## 6) Derived-Value & State Invariants (table)

- **Derived value:** `isCover` boolean on DocumentItem
  - **Source dataset:** Unfiltered attachment list from attachment-set query + `currentCoverAttachmentId` from parent entity's `cover_url`
  - **Write / cleanup triggered:** Cover mutations update backend, invalidate both attachment-set and parent entity queries
  - **Guards:** Backend ensures cover ID references attachment in same set
  - **Invariant:** At most one attachment per set has `isCover === true`; must match parent entity's `cover_url`
  - **Evidence:** `plan.md:340-346`

- **Derived value:** Attachment grid refetch trigger
  - **Source dataset:** TanStack Query data from `useGetAttachmentSetsAttachmentsBySetId` (unfiltered)
  - **Write / cleanup triggered:** Mutations invalidate queries, triggering automatic refetch
  - **Guards:** Query enabled only when `attachmentSetId` is available
  - **Invariant:** Grid always reflects latest attachment set state after successful mutation
  - **Evidence:** `plan.md:348-355`

- **Derived value:** Document upload progress state
  - **Source dataset:** Local state in `useDocumentUpload` hook (unfiltered)
  - **Write / cleanup triggered:** Progress updates trigger UI re-renders, reset to 0 on modal open, cleaned up after 2-5s timeout
  - **Guards:** Progress reset on modal open, timeout cleared on unmount
  - **Invariant:** `isUploading` is true only during active fetch, progress is 0-100
  - **Evidence:** `plan.md:357-364`

- **Derived value:** Archived kit interaction state
  - **Source dataset:** Single kit detail entity `status` field from unfiltered query
  - **Write / cleanup triggered:** No writes; read-only guard on UI interactions
  - **Guards:** All mutation buttons check `kit.status === 'archived'`
  - **Invariant:** Archived kits cannot modify attachments (backend enforced), UI prevents attempts (UX)
  - **Evidence:** `plan.md:366-373`

**No filtered-view-driving-writes concerns:** All derived values either use unfiltered data sources or are read-only guards. The cover URL derivation (first entry) uses unfiltered attachment list and triggers broad query invalidation that was verified to cover all filtered views (section 3 resolution). No additional guards required.

## 7) Risks & Mitigations (top 3)

- **Risk:** Generic hooks may introduce breaking changes to existing part attachment flows
- **Mitigation:** Plan now clarifies parts will CONTINUE using existing generated hooks (not deleted), minimizing refactor scope. Slice 2 verification step requires existing Playwright tests to pass (`plan.md:739`). TypeScript catches interface mismatches.
- **Evidence:** `plan.md:809-812`, `plan.md:733-739`

- **Risk:** Playwright tests may be difficult to write without proper test infrastructure
- **Mitigation:** Plan now includes complete factory method specifications (`plan.md:571-623`), page object design (`plan.md:625-663`), and wait strategies (`plan.md:665-679`) before implementation begins. Slice 5 has all required infrastructure specified.
- **Evidence:** `plan.md:814-817`, `plan.md:778-788`

- **Risk:** Archived kit restriction may be inconsistent across attachment actions or bypassable
- **Mitigation:** Plan applies archived check to all mutation buttons with `aria-disabled` (`plan.md:433`), clarifies backend provides security enforcement while UI provides UX convenience (`plan.md:514-521`), includes test scenario verifying backend rejection if UI bypass attempted (`plan.md:521`). Residual risk is LOW and documented.
- **Evidence:** `plan.md:803-807`, `plan.md:514-521`

All top risks from first review have been mitigated. Remaining risks are standard implementation concerns with documented patterns.

## 8) Confidence

**Confidence:** High — The updated plan successfully addresses all major conditions from the first review with concrete evidence. Key improvements include:

- Verified query invalidation pattern with TanStack Query prefix matching proof
- Clarified part convenience endpoint status (hooks exist, will be used)
- Complete test infrastructure specification (factories, page objects, wait strategies)
- Documented backend enforcement expectations for archived kits
- Corrected test ID conventions to match project patterns
- Specified upload modal backward compatibility design

The plan demonstrates thorough research, provides repository evidence for all claims, and includes comprehensive test coverage specification. The implementation approach is incremental and verifiable. No blocking issues remain.

## Additional Notes

**Strengths of the updated plan:**

1. **Research-backed claims:** Section 0 Research Log documents verification work including query key structure analysis, existing test infrastructure review, and OpenAPI schema checks.

2. **Complete test specification:** Section 13 now provides implementation-ready factory methods, page object structure, and wait strategies rather than deferring to test authoring phase.

3. **Backward compatibility:** Upload modal design (`plan.md:749-762`) explicitly handles both `partId` and `attachmentSetId` with validation and documentation of mutually exclusive usage.

4. **Archived kit handling:** Clarified that UI guards are UX convenience while backend provides security enforcement (`plan.md:514-521`), with test coverage for backend rejection.

5. **Incremental verification:** Each implementation slice includes specific verification steps and dependencies, enabling early detection of integration issues.

**Minor observations (not blocking):**

- Section 9 (Observability/Instrumentation) notes that instrumentation scope will be finalized during test authoring but provides reasonable defaults (existing list loading and form events). This deferred decision is acceptable given existing patterns cover most needs.

- Section 15 (Risks) includes a "MEDIUM RISK" for generic hook refactoring, but the plan has actually minimized this risk by clarifying parts will continue using existing hooks. This risk could be downgraded to LOW.

**Ready for execution:** The plan can proceed to implementation without additional research or design work. All critical decisions are locked in with evidence.
