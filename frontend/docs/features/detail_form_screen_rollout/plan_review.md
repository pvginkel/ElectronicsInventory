### 1) Summary & Decision
Execution is blocked until the plan reconciles its layout refactor with existing consumers and brings the promised instrumentation in line with what the suite can actually wait on. Removing the `PartForm` render-prop without either keeping the inline edit shell or migrating edit mode into a dedicated route (and updating the plan accordingly) leaves core CRUD flows undefined, and coverage still points at a non-existent `parts.detail` scope.  
**Decision:** `NO-GO` — Critical implementation gaps (part edit surface + instrumentation contract) must be resolved first.

### 2) Conformance & Fit (with evidence)
- **Conformance to refs:**
  - `docs/commands/plan_feature.md` — **Fail**: The coverage section directs tests to wait on `waitForListLoading(..., 'parts.detail')` but the plan never commits to adding that scope, violating the requirement that coverage stay backend-driven and deterministic (docs/features/detail_form_screen_rollout/plan.md:52; docs/commands/plan_feature.md:20-22).
  - `docs/product_brief.md` — **Pass**: Extending the fixed-header detail and edit flows keeps parts and boxes management responsive, matching the brief’s emphasis on quickly accessing inventory detail and edit surfaces (docs/features/detail_form_screen_rollout/plan.md:27-43; docs/product_brief.md:3-35).
  - `AGENTS.md` — **Fail**: Plan leans on instrumentation-driven waits but omits the work to provide the `parts.detail` scope it references, conflicting with the mandate to “ship instrumentation changes and matching Playwright coverage in the same slice” (docs/features/detail_form_screen_rollout/plan.md:29-31,52; AGENTS.md:40-46).
- **Fit with codebase:** Plan assumes `PartForm` can drop its `screenLayout` prop, yet `PartDetails` relies on it to inject `FormScreenLayout` for inline edit today (docs/features/detail_form_screen_rollout/plan.md:34-36; src/components/parts/part-details.tsx:187-199). It also proposes trimming layout props without acknowledging `DetailScreenLayout` usage in shopping list detail (`titleMetadata`, `supplementary`, `toolbar`) that would break if removed (docs/features/detail_form_screen_rollout/plan.md:45-46; src/routes/shopping-lists/$listId.tsx:613-626).

### 3) Open Questions & Ambiguities
- If edit mode is moving to its own screen (e.g., `/parts/$partId/edit`), what route/component owns it, and which `data-testid`s will replace the current inline selectors? Clarify before removing `PartForm.screenLayout`.
- Will the team add a `parts.detail` instrumentation scope (or adjust coverage expectations) so Playwright has a deterministic wait? Document the chosen path and metadata contract.
- Which `DetailScreenLayout`/`FormScreenLayout` props are truly unused across the app (shopping lists currently rely on several)? Provide an audit summary before any deletions.

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Parts detail fixed header/toolbars — **Major**  
  **Scenarios:** Extend the part CRUD spec to scroll the detail body and verify the header/toolbar stay pinned (docs/features/detail_form_screen_rollout/plan.md:59).  
  **Instrumentation:** Plan directs tests to wait on `waitForListLoading(..., 'parts.detail')`, but that scope is neither present today nor scheduled, so deterministic waits are undefined (docs/features/detail_form_screen_rollout/plan.md:52,59; src/hooks/use-part-shopping-list-memberships.ts:253-261).  
  **Backend hooks:** “Seed a part with enough related sections” is noted, but no explicit factory/helper is referenced; call out the exact `testData.parts` helpers to stay backend-driven.
- Parts create/duplicate screen layout  
  **Scenarios:** Exercise create and duplicate flows, scroll the form body, and assert pinned header/footer (docs/features/detail_form_screen_rollout/plan.md:60).  
  **Instrumentation:** Waiting on `PartForm:create` / `PartForm:duplicate` aligns with existing instrumentation, but the plan mixes selector conventions (`parts.detail.edit.content` vs `parts.form.*`) without deciding which persists (docs/features/detail_form_screen_rollout/plan.md:31,35,60; src/components/parts/part-form.tsx:327-668).  
  **Backend hooks:** Reference `testData.parts.create` / duplication helpers explicitly so specs stay API-seeded.
- Boxes detail fixed header  
  **Scenarios:** Scroll the converted detail layout and verify pinned header/action bar (docs/features/detail_form_screen_rollout/plan.md:39-42,61).  
  **Instrumentation:** Waiting on `waitForListLoading(..., 'boxes.detail')` is compatible with existing instrumentation (docs/features/detail_form_screen_rollout/plan.md:52,61; src/components/boxes/box-details.tsx:40-55).  
  **Backend hooks:** Note the `testData.boxes.create` helper (or equivalent) to guarantee sufficient locations for overflow tests.

### 5) **Adversarial Sweep (must find ≥3 credible issues or declare why none exist)**
**[A] Major — Part edit surface undefined after removing `PartForm.screenLayout`**  
**Evidence:** “Remove the legacy card branch inside `PartForm`: collapse `screenLayout` into required props…” (docs/features/detail_form_screen_rollout/plan.md:34-36) versus `PartDetails` embedding the form through that render-prop to keep edit mode inside `FormScreenLayout` (src/components/parts/part-details.tsx:187-199).  
**Why it matters:** Without a replacement, the edit toggle would either lose the fixed layout or require duplicating form markup, breaking the pattern mandated by `docs/contribute/ui/data_display.md` (docs/contribute/ui/data_display.md:14-16). Migrating edit mode to a dedicated `/parts/$partId/edit` route could work, but the plan must actually call for that file, navigation hooks, and updated selectors.  
**Fix suggestion:** Amend the plan to (a) retain `screenLayout`, or (b) explicitly introduce a new edit route/component (e.g., `src/routes/parts/$partId.edit.tsx`) that renders `FormScreenLayout` itself, updates navigation from detail to the new screen, and lists the selectors/tests that will remain stable.  
**Confidence:** High.

**[B] Major — Coverage depends on missing `parts.detail` instrumentation**  
**Evidence:** Plan directs tests to wait on `waitForListLoading(..., 'parts.detail')` (docs/features/detail_form_screen_rollout/plan.md:52,59) yet the only instrumentation today uses the `parts.detail.shoppingLists` scope (src/hooks/use-part-shopping-list-memberships.ts:253-261); no step adds the new scope.  
**Why it matters:** Playwright will block on a scope that never resolves, causing flakes or forcing DOM heuristics—contrary to `AGENTS.md` and the testing guide (AGENTS.md:40-46; docs/contribute/testing/playwright_developer_guide.md:14-19).  
**Fix suggestion:** Add an explicit step to introduce `useListLoadingInstrumentation` in the main detail fetch (define metadata, ready/error semantics) or adjust coverage to rely on existing scopes.  
**Confidence:** High.

**[C] Major — Layout prop cleanup endangers shopping list detail**  
**Evidence:** “Delete unused props/helpers from `FormScreenLayout`/`DetailScreenLayout`” (docs/features/detail_form_screen_rollout/plan.md:45-46) while shopping lists pass `titleMetadata`, `supplementary`, `metadataRow`, and `toolbar` into `DetailScreenLayout` today (src/routes/shopping-lists/$listId.tsx:613-626).  
**Why it matters:** Casual removal would break the shopping list detail screen or force it to reintroduce bespoke wrappers, violating the reuse goal.  
**Fix suggestion:** Require an audit listing every consumer and the props they use, then limit cleanup to truly dead code or skip it entirely in this slice.  
**Confidence:** Medium.

### 6) **Derived-Value & Persistence Invariants (table)**
| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | -------- |
| `formId = generateFormId('PartForm', mode)` | Unfiltered props (`partId`, `duplicateFromPartId`) | Names emitted with `useFormInstrumentation` events (`trackSubmit`, `trackValidationErrors`) | `isEditing` / `isDuplicating` booleans determine mode | Layout refactor must not remount the form or change IDs mid-session, or tests will miss `PartForm:*` events | src/components/parts/part-form.tsx:47-98 |
| `duplicateDocuments` list & `coverDocumentId` | Filtered duplicate source data from `useDuplicatePart` | Triggers `usePostPartsCopyAttachment` copies during submit | `isDuplicating` && fetched documents | Cleanup must still clear documents and cover ID when duplication finishes or cancels, even after moving layout helpers | src/components/parts/part-form.tsx:88-154,599-612 |
| `getReadyMetadata()` for `boxes.detail` instrumentation | Combined detail (`useGetBoxesByBoxNo`) + locations (`useBoxLocationsWithParts`) filtered by `boxNo` | Emits test-event payloads consumed by `waitForListLoading('boxes.detail')` | Queries resolved without error | Layout migration must keep metadata accurate (`boxNo`, `locations`) so Playwright waits remain deterministic | src/components/boxes/box-details.tsx:29-55 |

### 7) Risks & Mitigations (top 3)
- Part edit flows lose their fixed header unless the plan keeps `screenLayout` or formally moves editing into a dedicated route with `FormScreenLayout` of its own—lock this down before implementation (docs/features/detail_form_screen_rollout/plan.md:34-36; src/components/parts/part-details.tsx:187-199).
- Playwright coverage will stall without a real `parts.detail` scope—add instrumentation work or adjust coverage strategy in the plan (docs/features/detail_form_screen_rollout/plan.md:52,59; src/hooks/use-part-shopping-list-memberships.ts:253-261).
- Removing “unused” layout props risks breaking shopping list detail—perform a consumer audit and gate any cleanup on confirmed dead props (docs/features/detail_form_screen_rollout/plan.md:45-46; src/routes/shopping-lists/$listId.tsx:613-626).

### 8) Confidence
Medium — The issues stem from direct conflicts between the plan and current implementation, but confirming the intended instrumentation contract may require author clarification.
