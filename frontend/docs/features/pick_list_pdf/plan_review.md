# Plan Review: Pick List PDF Support

## 1) Summary & Decision

**Readiness**

The plan provides a clear technical approach for adding PDF viewing to pick lists but suffers from critical gaps in test coverage, instrumentation, and architectural conformance. The plan proposes creating a new `PdfViewerDialog` component instead of reusing the existing `MediaViewerBase`, lacks any Playwright test scenarios despite project requirements, provides no instrumentation events for deterministic testing, and does not address API client generation gaps. The plan explicitly defers Playwright testing as "future work" (plan.md:75-77), which directly violates the project's mandatory coupling between UI and test coverage (CLAUDE.md:44-47). While the core technical approach is sound, the plan requires substantial additions to meet Definition of Done standards.

**Decision**

`NO-GO` — The plan violates mandatory test coverage requirements and lacks essential instrumentation. The explicit deferral of Playwright tests (plan.md:75-77) contradicts CLAUDE.md:44-47 ("Ship instrumentation changes and matching Playwright coverage in the same slice; a UI feature is incomplete without automated verification"). Additionally, the plan creates a new component instead of following the existing pattern of reusing `MediaViewerBase`, and it does not address the generated API client gap for the PDF endpoint.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `CLAUDE.md:44-47` — **Fail** — plan.md:75-77 explicitly excludes Playwright tests ("Playwright Test (future work, not in this change)"), contradicting the requirement that "UI feature is incomplete without automated verification" and "Ship instrumentation changes and matching Playwright coverage in the same slice"
- `docs/commands/plan_feature.md:256-275` — **Fail** — plan.md:66-77 lacks the required "Deterministic Test Plan" section with Given/When/Then scenarios, instrumentation hooks, backend coordination, and gaps justification
- `docs/contribute/testing/playwright_developer_guide.md:1-10` — **Fail** — plan.md:75-77 defers test coverage, violating the principle that "tests frequently assert on emitted test-event payloads" and that instrumentation must be adjusted "before writing a spec"
- `docs/contribute/architecture/application_overview.md:30-34` — **Pass** — plan.md:13 correctly identifies that the PDF endpoint is not in the generated API client and proposes constructing the URL directly
- `docs/contribute/architecture/test_instrumentation.md:1-10` — **Fail** — plan.md:51-57 proposes test IDs but provides no instrumentation events (no `ui_state`, `list_loading`, or custom events) that tests could await

**Fit with codebase**

- `src/components/documents/media-viewer-base.tsx:164-177` — plan.md:8-10 — The plan proposes creating a new `PdfViewerDialog` component, but `MediaViewerBase` already handles PDF viewing via iframe (lines 294-300) and includes download, close, keyboard navigation, and dark background styling. The plan should reuse `MediaViewerBase` with a single-document array instead of duplicating its logic.
- `src/components/pick-lists/pick-list-detail.tsx:301-310` — plan.md:39-49 — The plan correctly identifies the actions section where the "View PDF" button should be added (line 301-310), and the state management pattern (useState for modal open/closed) aligns with existing component patterns
- `tests/e2e/pick-lists/pick-list-detail.spec.ts:1-996` — plan.md:75-77 — The plan defers Playwright tests, but the existing spec demonstrates the expected pattern: API-seeded data, `waitForListLoading`/`waitForUiState` instrumentation waits, and backend state verification. The PDF feature must follow this pattern.
- `src/components/documents/media-viewer-base.tsx:176-177` — plan.md:26 — The plan correctly notes disabling backdrop blur for PDFs to improve performance (line 176-177 in MediaViewerBase), which suggests familiarity with the existing implementation but contradicts the decision to create a separate component

## 3) Open Questions & Ambiguities

- Question: Should the PDF viewer reuse `MediaViewerBase` or justify creating a separate `PdfViewerDialog`?
- Why it matters: Duplicating logic increases maintenance burden and diverges from existing patterns. `MediaViewerBase` already handles PDFs, download, keyboard navigation, and dark backgrounds.
- Needed answer: Review `MediaViewerBase` implementation (src/components/documents/media-viewer-base.tsx:164-300) to confirm it can be reused with a single-document array, or provide technical justification for a separate component.

**Research findings:** `MediaViewerBase` accepts a `documents` array and `currentDocumentId`, renders PDFs in an iframe (lines 294-300), supports download (lines 92-99, 221-231), keyboard navigation (lines 123-159), and dark background with optional backdrop blur disabling for PDFs (lines 176-177). The plan's proposed `PdfViewerDialog` would duplicate all of this logic. **Recommendation:** Reuse `MediaViewerBase` by passing a single-element documents array with the PDF URL.

- Question: How will the plan handle the missing generated API client for `GET /api/pick-lists/{id}/pdf`?
- Why it matters: The plan notes the endpoint is "not yet in the generated API client" (plan.md:13) and proposes constructing the URL directly. This bypasses type safety and error handling provided by the generated client.
- Needed answer: Either regenerate the API client after the backend adds the endpoint to the OpenAPI schema, or document the temporary URL construction approach with a TODO to migrate once the schema is updated.

**Research findings:** The generated API client is produced by `pnpm generate:api` from the backend OpenAPI schema (CLAUDE.md:53, docs/contribute/architecture/application_overview.md:30-34). The plan should coordinate with the backend to add the PDF endpoint to the schema, regenerate the client, and use the type-safe generated hook instead of constructing URLs manually.

- Question: What instrumentation events should the PDF viewer emit for deterministic Playwright tests?
- Why it matters: The plan provides no instrumentation hooks (plan.md:51-57), which prevents deterministic test waits. Tests would need to rely on `data-testid` polling instead of event signals.
- Needed answer: Define `ui_state` events for PDF viewer lifecycle (e.g., `pickLists.detail.pdf` with `loading`/`ready` phases) following the pattern in docs/contribute/architecture/test_instrumentation.md:20-26.

**Research findings:** The project uses `useUiStateInstrumentation` for widget lifecycle events (docs/contribute/architecture/test_instrumentation.md:36, src/components/pick-lists/pick-list-detail.tsx:117-122, 133-138). The PDF viewer should emit `ui_state` events with scope `pickLists.detail.pdf` and phases `loading` (when opening) and `ready` (when iframe loads or errors occur). The existing `useUiStateInstrumentation` hook pattern should be followed.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: View PDF button on pick list detail page
- Scenarios:
  - **Missing**: Given a pick list exists, When user clicks "View PDF" button, Then PDF viewer opens and displays the PDF (no spec path provided)
  - **Missing**: Given the PDF viewer is open, When user clicks download button, Then the PDF downloads with the correct filename (no spec path provided)
  - **Missing**: Given the PDF viewer is open, When user presses Escape key, Then the viewer closes (no spec path provided)
  - **Missing**: Given the backend returns an error for the PDF endpoint, When user clicks "View PDF", Then an error state is displayed (no spec path provided)
- Instrumentation: plan.md:51-57 proposes `data-testid` attributes (`pick-lists.detail.actions.view-pdf`, `pdf-viewer-dialog`, `pdf-viewer-dialog.close`, `pdf-viewer-dialog.download`) but provides no test-event emissions for deterministic waits
- Backend hooks: No factory method proposed for seeding pick lists or verifying PDF generation; existing `testData.kits.createPickList` should be extended or documented
- Gaps: **Major** — Entire Playwright test suite is missing. Plan.md:75-77 explicitly defers tests as "future work," violating CLAUDE.md:44-47 mandatory coupling requirement. No instrumentation events defined (no `ui_state` scope for PDF viewer lifecycle, no `list_loading` events for PDF fetch state).
- Evidence: plan.md:66-77 ("Testing Approach" section contains only manual testing steps; Playwright subsection states "future work, not in this change")

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Missing Playwright Test Coverage Violates Project Standards**
**Evidence:** plan.md:75-77 — "Playwright Test (future work, not in this change): Test that the View PDF button is visible on pick list detail"
**Why it matters:** CLAUDE.md:44-47 mandates "Ship instrumentation changes and matching Playwright coverage in the same slice; a UI feature is incomplete without automated verification." The plan explicitly violates this by deferring tests. This creates technical debt and risks shipping untested code.
**Fix suggestion:** Add section "13) Deterministic Test Plan" with scenarios covering: (1) PDF viewer opens and displays PDF on button click, (2) Download button triggers PDF download, (3) Escape key closes viewer, (4) Backend error shows error state. Include `waitForUiState(page, 'pickLists.detail.pdf', 'ready')` instrumentation wait pattern. Extend `tests/e2e/pick-lists/PickListsPage.ts` page object with `viewPdfButton()` and `pdfViewer` locators. Use `testData.kits.createPickList()` for data seeding. Reference tests/e2e/pick-lists/pick-list-detail.spec.ts:85-92 for the existing pattern of waiting for detail page instrumentation.
**Confidence:** High

**Major — Proposes New Component Instead of Reusing Existing Pattern**
**Evidence:** plan.md:8-10, 19-37 — "Create a reusable `PdfViewerDialog` component that follows the same visual pattern as `MediaViewerBase` but simplified for single-document PDF viewing." vs. src/components/documents/media-viewer-base.tsx:164-177, 294-300 which already handles PDF viewing with iframe, download, keyboard navigation, dark background, and backdrop blur disabling for performance.
**Why it matters:** Creating a duplicate component violates DRY principles, increases maintenance burden (two places to update when PDF viewing logic changes), and diverges from existing patterns documented in the codebase. The plan acknowledges `MediaViewerBase` already exists but proposes duplication without justification.
**Fix suggestion:** Replace section "Step 1: Create the PDF Viewer Dialog Component" with "Step 1: Integrate MediaViewerBase for PDF Viewing." Construct a `documents` array with a single entry: `{ id: 'pdf', type: 'pdf', title: 'Pick List {detail.id}', assetUrl: '/api/pick-lists/${detail.id}/pdf' }`. Reuse `MediaViewerBase` props: `isOpen={isPdfViewerOpen}`, `onClose={() => setIsPdfViewerOpen(false)}`, `documents={[pdfDocument]}`, `currentDocumentId="pdf"`, `onNavigate={undefined}` (since there's only one document). This eliminates 50+ lines of duplicated code and ensures consistent behavior with existing document viewing. Reference src/components/documents/media-viewer-base.tsx:11-17 for the MediaViewerProps interface and lines 294-300 for the existing PDF iframe rendering logic.
**Confidence:** High

**Major — No Instrumentation Events for Deterministic Testing**
**Evidence:** plan.md:51-57 — "Add appropriate test IDs for Playwright testing" lists only `data-testid` attributes, but provides no `ui_state`, `list_loading`, or custom test-event emissions. docs/contribute/architecture/test_instrumentation.md:20-26 defines required event taxonomy, and src/components/pick-lists/pick-list-detail.tsx:117-122, 133-138 demonstrates the `useUiStateInstrumentation` pattern used throughout the codebase.
**Why it matters:** Without instrumentation events, Playwright tests must rely on brittle polling or fixed waits instead of deterministic event signals. This increases flakiness and violates the documented testing pattern (docs/contribute/testing/playwright_developer_guide.md:125-154). Tests would not be able to reliably wait for the PDF viewer to be ready or handle errors deterministically.
**Fix suggestion:** Add section "9) Observability / Instrumentation" with the following:
- Signal: `ui_state` event with scope `pickLists.detail.pdf`
- Type: `ui_state` instrumentation event
- Trigger: Emit `loading` phase when `isPdfViewerOpen` becomes true, emit `ready` phase when iframe `onLoad` fires or after timeout, emit `ready` with error metadata if iframe `onError` fires
- Labels / fields: `{ pickListId, status: 'opened' | 'error' }` in metadata
- Consumer: Playwright helper `waitForUiState(page, 'pickLists.detail.pdf', 'ready')` in tests
- Evidence: Implementation should follow src/components/pick-lists/pick-list-detail.tsx:117-122 pattern using `useUiStateInstrumentation({ scope: 'pickLists.detail.pdf', isLoading: isPdfViewerOpen && !pdfLoaded, error: pdfError, getReadyMetadata: () => ({ pickListId: detail.id }) })`
Also update section "Step 2: Add PDF Button to Pick List Detail" to wire instrumentation hooks alongside state management.
**Confidence:** High

**Minor — Generated API Client Gap Not Addressed with Migration Plan**
**Evidence:** plan.md:13 — "Since the PDF endpoint is not yet in the generated API client, construct the URL directly as `/api/pick-lists/{id}/pdf`." No TODO, migration plan, or backend coordination mentioned.
**Why it matters:** Manually constructed URLs bypass type safety, correlation IDs, and centralized error handling provided by the generated client (docs/contribute/architecture/application_overview.md:30-34). This technical debt should be tracked with a concrete migration plan.
**Fix suggestion:** Add to section "15) Risks & Open Questions":
- Risk: PDF endpoint URL is manually constructed because OpenAPI schema does not yet include `GET /api/pick-lists/{id}/pdf`
- Impact: Loses type safety, correlation ID propagation, and centralized error handling
- Mitigation: (1) Coordinate with backend to add endpoint to OpenAPI schema, (2) Run `pnpm generate:api` to regenerate client, (3) Replace manual URL construction with `useGetPickListsByPickListIdPdf()` generated hook, (4) Add a TODO comment in pick-list-detail.tsx next to the URL construction: `// TODO: Replace with generated API hook once backend adds /pdf endpoint to OpenAPI schema`
- Owner: Backend team to add endpoint to schema; frontend to regenerate and refactor once available
**Confidence:** Medium

**Minor — Test ID Naming Inconsistency with Existing Pattern**
**Evidence:** plan.md:54-57 proposes `pdf-viewer-dialog`, `pdf-viewer-dialog.close`, `pdf-viewer-dialog.download` but existing test IDs follow `feature.section.element` format (tests/e2e/pick-lists/pick-list-detail.spec.ts uses `pick-lists.detail.actions.delete`, `pick-lists.detail.line.{id}.quantity`). Generic `pdf-viewer-dialog` lacks feature context.
**Why it matters:** Inconsistent naming makes test selectors harder to maintain and trace back to features. The proposed IDs are component-centric rather than feature-scoped.
**Fix suggestion:** If creating a new component, use feature-scoped test IDs: `pick-lists.detail.pdf-viewer`, `pick-lists.detail.pdf-viewer.close`, `pick-lists.detail.pdf-viewer.download`. However, if reusing `MediaViewerBase` (recommended), leverage its existing selectors and add minimal pick-list-specific instrumentation only for the "View PDF" button (`pick-lists.detail.actions.view-pdf` is correctly scoped).
**Confidence:** Medium

## 6) Derived-Value & State Invariants (table)

- Derived value: `isPdfViewerOpen` (boolean state)
  - Source dataset: User interaction (button click) to toggle modal visibility
  - Write / cleanup triggered: Local component state mutation (`setIsPdfViewerOpen(true/false)`), no cache write or navigation side effects
  - Guards: Feature is purely UI state; PDF URL is constructed per-render from `detail.id`
  - Invariant: When `detail` is undefined (loading or error state), the "View PDF" button must not be rendered (plan.md:47-49 shows button is only rendered when `detail` exists, which satisfies this invariant)
  - Evidence: plan.md:42, 47-49 — `const [isPdfViewerOpen, setIsPdfViewerOpen] = useState(false)` and conditional rendering `const actions = detail ? <Button ... /> : null`

- Derived value: PDF URL (`/api/pick-lists/${detail.id}/pdf`)
  - Source dataset: Derived from `detail.id` which comes from the pick list detail query
  - Write / cleanup triggered: Read-only; no writes triggered by viewing PDF
  - Guards: URL is only constructed when `detail` exists (button is conditionally rendered)
  - Invariant: The URL must reflect the current pick list ID and must not be stale if the detail refetches with a different ID (unlikely in practice since detail page is mounted per-ID, but navigation between pick lists would unmount/remount the component, resetting state)
  - Evidence: plan.md:49 — `The PDF URL format: /api/pick-lists/${detail.id}/pdf`

- Derived value: None beyond the above
  - Evidence: The plan does not introduce filtered views, cache mutations, or cross-route state. The PDF viewer is purely modal UI state with no persistent effects. No additional derived values meet the "filtered view driving persistent write" risk profile that requires a third entry or justified "none; proof."

## 7) Risks & Mitigations (top 3)

- Risk: Playwright test deferral creates deployment risk and violates Definition of Done
- Mitigation: Add comprehensive Playwright test scenarios (PDF viewer open/close, download, keyboard navigation, error handling) with instrumentation waits before marking the plan as implementation-ready. Follow the pattern in tests/e2e/pick-lists/pick-list-detail.spec.ts:85-92 for detail page instrumentation.
- Evidence: plan.md:75-77 ("Playwright Test (future work, not in this change)"), CLAUDE.md:68-72 Definition of Done requires "Playwright specs are created or updated in the same change"

- Risk: Creating a new `PdfViewerDialog` component duplicates logic and diverges from existing patterns
- Mitigation: Refactor plan to reuse `MediaViewerBase` with a single-document array. This reduces maintenance burden, ensures consistent UX, and aligns with DRY principles. If a separate component is truly required, provide technical justification (e.g., MediaViewerBase cannot be adapted, performance constraints, etc.).
- Evidence: plan.md:8-10, 19-37 (proposes new component), src/components/documents/media-viewer-base.tsx:164-300 (existing implementation handles PDFs)

- Risk: Manual URL construction for PDF endpoint bypasses type safety and centralized error handling
- Mitigation: Coordinate with backend to add `GET /api/pick-lists/{id}/pdf` to the OpenAPI schema, regenerate the API client with `pnpm generate:api`, and replace manual URL construction with the generated hook. Until then, add a TODO comment documenting the technical debt and migration path.
- Evidence: plan.md:13 ("not yet in the generated API client, construct the URL directly"), docs/contribute/architecture/application_overview.md:30-34 (generated API client provides type safety and error handling)

## 8) Confidence

Confidence: Low — The plan demonstrates understanding of the integration point and UI patterns but fails to meet project standards in critical areas: (1) mandatory Playwright test coverage is explicitly deferred, (2) proposes creating a new component instead of reusing existing patterns without justification, (3) lacks instrumentation events required for deterministic testing, and (4) does not address the generated API client gap with a migration plan. The plan requires substantial revision to align with documented architecture, testing requirements, and Definition of Done before it can guide implementation.
