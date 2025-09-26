# Cover Presence Flag – Code Review

## Findings

1. **Cover selector still triggers the 404 flow** (`src/components/documents/cover-image-selector.tsx:18`)
   - `CoverImageSelector` continues to call `useCoverAttachment(partId)` without the new `hasCoverAttachment` hint, so opening the picker for a part that lacks a cover will still fire `GET /api/parts/{part_key}/cover`, now retried three times. That reintroduces the 404 console noise we set out to eliminate. Please extend the selector props to accept the flag (you already have the value in `PartDetails` via `Boolean(part.cover_attachment)`) and pass it through to the hook so we can skip the fetch when the backend says no cover exists.

## Questions / Follow-ups

- The Playwright fixture now logs every browser console message and every ≥400 response to stdout (`tests/support/fixtures.ts:65` and `tests/support/fixtures.ts:69`). Was that intentional? It adds quite a bit of noise to local runs; if it was just for debugging we should drop it before merging.

## Notes

- The new `cover-presence` e2e spec gives us a nice regression test that verifies the list view no longer hits `/cover` when the flag is false.
