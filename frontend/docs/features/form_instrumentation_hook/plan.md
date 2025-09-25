# Form Instrumentation Hook – Plan

## Context
We need a higher-level construct that prevents duplicate `form/open` instrumentation without burdening each component (e.g., `src/components/types/TypeForm.tsx`). The goal is to introduce a reusable hook that centralizes the lifecycle tracking while keeping forms declarative.

## Relevant Code Surfaces
- `src/lib/test/form-instrumentation.ts` — source of `trackForm*` primitives.
- `src/hooks/` — new `useFormInstrumentation` hook lives here.
- `src/components/types/TypeForm.tsx` — current ref-based workaround to replace.
- `src/components/parts/part-form.tsx` — emits duplicate open events via `useEffect` on `formData.description`.
- `tests/e2e/types/type-form.spec.ts` — verify the new hook keeps instrumentation visible to existing Playwright coverage.

## Phase Outline
1. **Hook + Component Integration** — build `useFormInstrumentation`, migrate `TypeForm` and `PartForm`, and adjust supporting code as needed.

## Hook Design (Phase 1)
1. Create `src/hooks/use-form-instrumentation.ts` exporting a hook with this shape:
   - Inputs: `{ formId, isOpen, snapshotFields, autoSubmitTracking?: boolean }`.
   - Returns: `{ trackOpen, trackSubmit, trackSuccess, trackError, trackValidationError }` (names can be refined) so callers wire instrumentation without remembering raw `trackForm*` APIs.
2. Internal algorithm:
   - Maintain refs for the previous `isOpen` state and the last tracked `formId`.
   - On render, detect `false → true` transitions; call `trackFormOpen(formId, snapshotFields())` to emit a single open event per session.
   - Provide `trackSubmit`, `trackSuccess`, `trackError`, and `trackValidationError` passthrough helpers that wrap the low-level functions.
3. Update `src/components/types/TypeForm.tsx` to:
   - Import the hook and call it inside the component with `{ formId, isOpen: open, snapshotFields: () => ({ name: form.values.name }) }`.
   - Replace direct `trackForm*` calls with hook methods and drop the manual refs/effect.
4. Update `src/components/parts/part-form.tsx` to:
   - Instantiate the hook with `{ formId, isOpen: true }` semantics appropriate for a mounted card-style form (emit `trackOpen` once when the hook notices the form is “open”).
   - Route submit/success/validation tracking through the hook to keep the API aligned.
5. Ensure the hook reuses existing ID generators and stays agnostic of form implementation (`useFormState` and other local logic remain untouched).
6. Re-run `tests/e2e/types/type-form.spec.ts`; adjust expectations only if the hook changes event payloads or timing.

### Illustrative Hook Usage (requested code sample)
```tsx
const instrumentation = useFormInstrumentation({
  formId,
  isOpen: open,
  snapshotFields: () => ({ name: form.values.name }),
});

const handleSubmit = form.handleSubmit(async values => {
  instrumentation.trackSubmit(values);
  try {
    await onSubmit(process(values));
    instrumentation.trackSuccess(values);
    onOpenChange(false);
  } catch (error) {
    instrumentation.trackError(values, error);
    throw error;
  }
});
```
