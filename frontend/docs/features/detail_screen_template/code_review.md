## 1) Summary & Decision
Detail and form shells now centralise the fixed-header/fixed-footer pattern and the updated Playwright specs prove both Concept/Ready and Part edit behave as intended. The remaining gap is the plan-mandated form “context” slot, so the slice is not quite ready to merge. **Decision:** GO-WITH-CONDITIONS (add the missing slot).

## 2) Conformance to Plan (with evidence)
- Shared detail shell follows the slot + single-scroll contract. **Evidence:** docs/features/detail_screen_template/plan.md:19-23 — “Build a layout … single scroll container”; src/components/layout/detail-screen-layout.tsx:45-88 — `<div className="flex h-full min-h-0 flex-col"> … <main className="flex-1 min-h-0 overflow-auto …">`.
- Shopping list route swaps to the layout and routes toolbar/content through the documented slots. **Evidence:** docs/features/detail_screen_template/plan.md:28-33 — “replace the top-level div … render toolbars via the layout’s `toolbar` slot”; src/routes/shopping-lists/$listId.tsx:612-628 — `<DetailScreenLayout … toolbar={toolbarNode ?? undefined}>`.
- `PartForm` exposes the `{ header, content, footer }` render-prop so callers can inject a screen shell. **Evidence:** docs/features/detail_screen_template/plan.md:35-36 — “`PartForm` should call it with `{ header, content, footer }`”; src/components/parts/part-form.tsx:327-666 — `const renderedForm = screenLayout ? screenLayout({ header: headerSection, content: contentSection, footer: footerSection })`.
- Plan items still outstanding: the form layout omitted the required `context` slot (see Findings).

## 3) Correctness — Findings (ranked)
- **[F-001] Major — Missing `context` slot on `FormScreenLayout`**  
  **Evidence:** docs/features/detail_screen_template/plan.md:22-23 — “Accept `breadcrumbs`, `title`, `actions`, `children`, `footer`, and optional `context` slot for helper copy.”; src/components/layout/form-screen-layout.tsx:5-40 — `interface FormScreenLayoutProps { … footerProps?: HTMLAttributes<HTMLElement>; }` (no `context`).  
  **Why it matters:** Designates cannot surface helper copy (“optional contextual helper”) inside the fixed header, so upcoming edit flows that rely on that copy will have nowhere to render it.  
  **Fix suggestion:** Add `context?: ReactNode` to the props, render it beside/below the title (likely under the title block), and expose a matching test id so Playwright can assert it.  
  **Confidence:** High.

## 4) Over-Engineering & Refactoring Opportunities
None beyond the context-slot addition; the layouts stay close to the documented abstractions otherwise.

## 5) Style & Consistency
No additional concerns.

## 6) Tests & Deterministic Coverage (new/changed behavior only)
- **Scrolling shell — Concept view:** Given a long Concept list, when content scrolls the header & toolbar stay pinned. **Evidence:** tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:135-160 — scrolls content and compares header/toolbar rects.  
- **Scrolling shell — Ready view:** Given a Ready list with many seller groups, when scrolling the groups the header/toolbar remain fixed. **Evidence:** tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:209-234.  
- **Form shell — Part edit:** Given an edit session, when scrolling fields the header/footer remain in view. **Evidence:** tests/e2e/parts/part-crud.spec.ts:49-75.  
No automated coverage ensures the context/helper slot renders; add a test once the slot lands.

## 7) Adversarial Sweep
- Verified only the intended container scrolls by inspecting both shells (`DetailScreenLayout` and `FormScreenLayout`). **Evidence:** src/components/layout/detail-screen-layout.tsx:45-88; src/components/layout/form-screen-layout.tsx:45-88 — both isolate the scrollable `<main>`.  
- Confirmed shopping list instrumentation still fires with duplicate metadata so layout changes did not break telemetry. **Evidence:** src/routes/shopping-lists/$listId.tsx:160-174 — `useListLoadingInstrumentation({ … duplicate: duplicateNotice ? 'present' : 'none' })`.

## 8) Invariants Checklist
| Invariant | Where enforced | How it could fail | Current protection | Evidence (file:lines) |
|---|---|---|---|---|
| Detail header/toolbar remain fixed while body scrolls | `DetailScreenLayout` | Consumers wrap the layout in another scroll container | Header/toolbar live outside the sole `overflow-auto` `<main>` | src/components/layout/detail-screen-layout.tsx:45-88 — `main className="flex-1 min-h-0 overflow-auto"` |
| Form submit buttons stay inside the actual `<Form>` | `PartForm` render-prop result | Caller renders footer outside of the form | `renderedForm` always nested within `<Form …>` even in screen mode | src/components/parts/part-form.tsx:655-666 — `<Form …>{renderedForm}</Form>` |
| Shopping list instrumentation records duplicate state | Shopping list detail route | Layout refactor skips metadata wiring | `useListLoadingInstrumentation` merges duplicate status into ready/error payloads | src/routes/shopping-lists/$listId.tsx:160-174 — `duplicate: duplicateNotice ? 'present' : 'none'` |

## 9) Questions / Needs-Info
1. Should the edit breadcrumb live inside `FormScreenLayout` once the context slot exists, or remain in the route shell? Clarifying this avoids double-rendering when we wire breadcrumbs into the new layout.

## 10) Risks & Mitigations (top 3)
- Missing form `context` slot blocks helper copy required by later edit flows → expose the slot per plan before onboarding more screens.  
- Without the slot, the upcoming rollout plan will need bespoke hacks per screen → fixing it now keeps the rollout incremental.  
- Lack of tests around the context slot makes future regressions easy → add a Playwright assertion once the slot renders helper copy.

## 11) Confidence
Medium — Reviewed all touched components and specs, but the large `PartForm` changes deserve another quick pass after the header/context fixes.
