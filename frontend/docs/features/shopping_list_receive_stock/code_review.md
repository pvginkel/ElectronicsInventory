# Code Review

## Findings

- **Medium – Duplicate form instrumentation events** (`src/components/shopping-lists/ready/update-stock-dialog.tsx:336`): the dialog calls `formInstrumentation.trackOpen()` in an effect that runs whenever `open` or `line?.id` changes. The `useFormInstrumentation` hook already emits an `open` event whenever the dialog opens or the `formId` changes, so this extra call causes every modal open (and every Save & next hop) to log two `form` events. Instrumentation is part of the UI contract; duplicating events breaks the deterministic event stream that both analytics and Playwright rely on. Please drop the manual `trackOpen()` call and let the hook manage the lifecycle.  
  _Resolution_: removed the redundant `trackOpen()` effect so instrumentation now fires exactly once per open.

## Notes

- Plan steps are otherwise satisfied: the modal, mutations, cache reconciliation, routing glue, and Playwright coverage all line up with the feature brief.
