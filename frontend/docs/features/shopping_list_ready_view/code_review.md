# Shopping List Ready View – Code Review

## Findings
- **High · instrumentation gap** — `src/routes/shopping-lists/$listId.tsx:118`  
  The plan called for emitting aborted metadata from `useListLoadingInstrumentation` so Playwright can distinguish a cancelled fetch from a successful ready state. We now provide `status`, `view`, `groupCount`, etc., but never pass `getAbortedMetadata`. When the user navigates away mid-request the suite will miss the `aborted` phase that our testing helpers expect, making new specs flaky and breaking parity with `docs/contribute/testing/playwright_developer_guide.md`.

- **Medium · misleading toast copy on zero-qty updates** — `src/routes/shopping-lists/$listId.tsx:239`  
  The single-line success toast always says `“Marked <part> Ordered”` even when the dialog is used to zero out the order quantity (which reverts the line to *New*). The plan’s copy polish asked for clear differentiation of ordering outcomes; today the message contradicts the actual state change and the Playwright assertions rely on that string, so reverting via the dialog will still report “Ordered”.

## Notes & Follow-ups
- Re-using `updateSellerGroupsWithLine` for optimistic cache updates keeps rows responsive, but regrouping a line whose seller is cleared still relies on the subsequent refetch. Consider extending the helper to move lines into the “Ungrouped” bucket immediately so the Ready view reflects seller changes without a flicker.
