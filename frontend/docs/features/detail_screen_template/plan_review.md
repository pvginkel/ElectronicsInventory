### 1) Summary & Decision
Plan captures the right surfaces and test intent, but layout APIs are underspecified (missing detail actions slot, ambiguous PartForm screen mode, unclear ConceptHeader dialog handling) so implementers would be guessing. Decision: GO-WITH-CONDITIONS — tighten those structural contracts before execution.

### 2) Conformance & Fit (with evidence)
Conformance to `docs/commands/plan_feature.md` — PASS; the plan names concrete files, prescribes stepwise changes, and enumerates deterministic Playwright work as required.
> docs/features/detail_screen_template/plan.md:5-13 — “`src/components/layout/detail-screen-layout.tsx` (new)… `tests/e2e/parts/part-crud.spec.ts`… assert headers/footers stay visible while content scrolls.”
> docs/features/detail_screen_template/plan.md:15-43 — Implementation steps 1–8 describe the ordered refactors and test updates.
> docs/features/detail_screen_template/plan.md:50-54 — Four explicit Playwright scenarios tied to instrumentation.

Conformance to `docs/product_brief.md` — PASS; the plan keeps shopping list detail headers actionable and preserves the part edit workflow that the brief calls out.
> docs/features/detail_screen_template/plan.md:3 — “shopping list detail header must surface the breadcrumb bar… Concept/Ready toolbar… The part edit screen must present a breadcrumb… scrollable middle section… bottom-aligned form buttons.”
> docs/product_brief.md:64-69 — Product brief defines the shopping list workflow that still needs the surfaced header/actions.
> docs/product_brief.md:119-133 — Part intake/edit flow that relies on the edit surface staying functional.

Conformance to `AGENTS.md` — PASS; instrumentation expectations are reiterated and aligned with contributor guidance.
> docs/features/detail_screen_template/plan.md:32-33 — “Preserve existing instrumentation (`useListLoadingInstrumentation`, form instrumentation)…”
> docs/features/detail_screen_template/plan.md:41-42 — Tests must wait on `shoppingLists.list`, `ShoppingListStatus:*`, `PartForm:edit`.
> AGENTS.md:34-45 — Agents note mandates using existing instrumentation and pairing UI with Playwright coverage.

Fit with codebase — PASS; the plan reuses existing layout patterns and hooks already present in the repo.
> docs/features/detail_screen_template/plan.md:20-33 — Detail layout reuses the flex `h-full min-h-0` pattern and router shell constraints.
> src/components/layout/list-screen-layout.tsx:4-98 — Current list layout exposes `actions` slots and the same flex/overflow pattern the plan references.
> docs/features/detail_screen_template/plan.md:45-48 — Plan keeps `useShoppingListDetail`/`validatePartData` flows untouched while only reorganising DOM.
> src/routes/shopping-lists/$listId.tsx:485-520 — Existing detail route already derives `status`, `canReturnToConcept`, etc., that the plan leans on.

### 3) Open Questions & Ambiguities
- How will `ConceptHeader` keep rendering the edit/delete dialog once it only returns slot fragments? (docs/features/detail_screen_template/plan.md:26; src/components/shopping-lists/concept-header.tsx:1-175). Losing that mount would block metadata edits; plan should specify whether the header returns `{slots, overlays}` or a wrapper component keeps dialog state.
- Should `DetailScreenLayout` expose an explicit `actions` slot for list-level buttons? (docs/features/detail_screen_template/plan.md:20-31). Without it we cannot place the existing edit/delete buttons; clarify the prop name and structure.
- Which API will `PartForm` adopt for screen mode — `variant` or `ScreenSections` — and how will a single `<Form>` wrap header/content/footer? (docs/features/detail_screen_template/plan.md:35-36). The answer dictates where submit buttons live and prevents duplicate forms.

### 4) Deterministic Playwright Coverage (new/changed behavior only)
Shopping list detail fixed header — Scenario: Given a seeded concept list that overflows, when the test scrolls `shopping-lists.detail.content`, then the header/toolbar rects stay constant (docs/features/detail_screen_template/plan.md:50-51). Instrumentation: Wait on `shoppingLists.list` and rely on new header/content test IDs (docs/features/detail_screen_template/plan.md:32,41). Backend hooks: Create lines via existing factories (docs/features/detail_screen_template/plan.md:50).

Ready view fixed toolbar — Scenario: Given a list promoted to Ready, when seller groups are scrolled, then header and Ready toolbar remain in view (docs/features/detail_screen_template/plan.md:52). Instrumentation: Continue waiting on `shoppingLists.list` and `ShoppingListStatus:*` events with stable toolbar IDs (docs/features/detail_screen_template/plan.md:31-32,41). Backend hooks: Use helpers to promote to Ready (docs/features/detail_screen_template/plan.md:52).

Part edit fixed form container — Scenario: Given an existing part opened in edit mode, when the form body scrolls, then the “Edit Part …” header and submit bar remain visible (docs/features/detail_screen_template/plan.md:53). Instrumentation: Reuse `PartForm:edit` instrumentation and footer test IDs (docs/features/detail_screen_template/plan.md:35-36,41,53). Backend hooks: Seed a part via factories before entering edit (docs/features/detail_screen_template/plan.md:53).

### 5) Adversarial Sweep
**[A] Major — Detail layout lacks actions slot**
Evidence: 
> docs/features/detail_screen_template/plan.md:20-23 — “accepts slots for `breadcrumbs`, `title`, `titleMetadata`… `toolbar`, `children`, and optional `footer`.”
> docs/features/detail_screen_template/plan.md:30-31 — “Pass breadcrumb/title/actions/status nodes… into the respective props.”
Why it matters: Shopping list edit/delete controls would have nowhere to render, breaking a core workflow.  
Fix suggestion: Explicitly add an `actions` slot (or equivalent) to `DetailScreenLayout` and describe how `ConceptHeader` supplies it.  
Confidence: High.

**[B] Major — PartForm screen mode risks breaking `<form>` semantics**
Evidence:
> docs/features/detail_screen_template/plan.md:35-36 — “Introduce props (e.g., `variant`) or expose `PartForm.ScreenSections` that return `{ header, content, footer }`… ensure the footer buttons live in the `footer` slot…”
> src/components/parts/part-form.tsx:334-645 — Current `<Form>` wraps all sections and the submit button (`data-testid="parts.form.submit"`) lives inside it.
Why it matters: If the footer buttons are hoisted outside the `<Form>`, submit/cancel will stop working or lose instrumentation.  
Fix suggestion: Specify a concrete pattern (e.g., layout renders the `<Form>` via render prop) that keeps a single form element enclosing header/content/footer.  
Confidence: High.

**[C] Major — ConceptHeader fragment plan omits dialog mounting strategy**
Evidence:
> docs/features/detail_screen_template/plan.md:26 — “Update `ConceptHeader`… to return discrete fragments…”
> src/components/shopping-lists/concept-header.tsx:1-175 — Component currently owns `Dialog` state and renders edit/delete controls plus the modal content.
Why it matters: Without defining where the dialog lives, the edit metadata workflow could be lost or duplicated, violating the product brief’s need to manage list details.  
Fix suggestion: Plan should call out a wrapper that returns `{slots, overlays}` or keeps `ConceptHeader` as a component that renders layout slots internally while still outputting the dialog.  
Confidence: Medium.

### 6) Derived-Value & Persistence Invariants
| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | -------- |
| `shoppingList.status` controls which toolbar slot renders | `useShoppingListDetail` result (unfiltered) | `useMarkShoppingListReadyMutation`, `useUpdateShoppingListStatusMutation` | Only render concept toolbar when status is `concept` | Concept toolbar must not appear once the list is Ready/Done | docs/features/detail_screen_template/plan.md:45-47; src/routes/shopping-lists/$listId.tsx:485-520 |
| `canReturnToConcept` / `canMarkListDone` booleans | `shoppingList` flags filtered for completion | `updateStatusMutation` and archive flow | Require `!isCompleted` before enabling actions | Status toggles never fire on completed lists | docs/features/detail_screen_template/plan.md:46; src/routes/shopping-lists/$listId.tsx:485-520 |
| `validation.isValid` from `validatePartData` | `formData` (filtered user input) | `createPartMutation` / `updatePartMutation` submissions | Block submit when invalid; keep instrumentation in sync | Form submissions only proceed when validation passes | docs/features/detail_screen_template/plan.md:47; src/components/parts/part-form.tsx:220-287,334-645 |

### 7) Risks & Mitigations (top 3)
- Detail layout missing an actions slot strands edit/delete controls; add an explicit `actions` prop before implementation (docs/features/detail_screen_template/plan.md:20-31).
- PartForm screen variant may detach buttons from the `<Form>`; mandate a render-prop or similar pattern that keeps a single form element (docs/features/detail_screen_template/plan.md:35-36; src/components/parts/part-form.tsx:334-645).
- ConceptHeader fragmenting can drop the edit dialog; spell out how overlays are returned or keep the dialog co-located (docs/features/detail_screen_template/plan.md:26; src/components/shopping-lists/concept-header.tsx:1-175).

### 8) Confidence
Medium — the gaps are clear and resolvable, but until the layout/form APIs are nailed down there’s meaningful risk of regressions.
