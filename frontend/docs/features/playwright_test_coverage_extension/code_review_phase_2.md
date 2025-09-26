# Code Review – Phase 2 (Types Coverage)

## Findings
- **High** `src/components/types/TypeForm.tsx:72` – `trackFormOpen` currently reruns on every keystroke because the effect depends on `form.values.name`. As soon as the modal is open, typing triggers additional `open` events, so the instrumentation stream records multiple `form/open` entries for a single form session. That breaks the documented taxonomy and makes test-event assertions noisy. Please gate the effect to fire only on the open transition (for example by removing the field dependency and using a ref to detect `false → true`).
- **Medium** `tests/e2e/types/type-form.spec.ts:28` – The new playwright tests only assert event order, so they still pass when duplicate `open` events appear (the bug above). Strengthen the assertions (e.g., ensure exactly one `open` event before submit/success) so the suite detects over-emission going forward.

## Questions / Follow-ups
- After addressing the instrumentation fix, can we add an assertion (or helper) that verifies the event buffer is clear between openings? That would give us stronger guarantees around the `form` taxonomy going into later phases.
