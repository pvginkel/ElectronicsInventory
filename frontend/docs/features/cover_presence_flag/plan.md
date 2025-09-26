# Cover Presence Flag – Plan

## Context
Fetching `/api/parts/{part_key}/cover` to discover whether a part has a cover image forces the UI to rely on 404 responses. This leaks into Playwright by generating expected console errors. We need an explicit `has_cover_image` signal in the API so the frontend can skip those calls and remove the 404-based control flow.

## Relevant Frontend Surfaces
- `src/components/documents/cover-image-display.tsx` and `src/components/ui/thumbnail.tsx` – cover renderers that must use a backend-provided flag to decide whether to request imagery.
- `src/components/parts/part-list.tsx` and `src/components/dashboard/quick-find-widget.tsx` – list UIs that show cover thumbnails for each part.
- `src/components/parts/part-document-grid.tsx`, `src/components/parts/duplicate-document-grid.tsx`, `src/components/parts/part-details.tsx` – downstream consumers that expect cover data post-fetch.
- `src/components/parts/ai-document-preview.tsx` – should always render when `image_url` is present; remove defensive `onError` logic.
- `src/hooks/use-cover-image.ts`, `src/hooks/use-duplicate-part.ts` – hooks that call the cover endpoint.
- Generated types/hooks in `src/lib/api/generated/**` – will need regeneration once backend adds the flag.
- Tests relying on cover imagery: `tests/e2e/types/type-selector.spec.ts`, `tests/e2e/parts/**`, and any units asserting thumbnail behaviour.
- Image error handling refinement:
  - `media-viewer-base.tsx` keeps its existing `onError` handling for genuine user-provided failures.
  - `cover-image-display.tsx` and `ui/thumbnail.tsx` require backend data to prevent needless 404s instead of relying on `onError` fallbacks.
  - `ai-document-preview.tsx` should drop `onError` and associated state now that its backend guarantees a valid `image_url`.

## Backend Schema & Endpoint Updates (confirmed)
- List-style part schemas now expose `has_cover_attachment` (see `PartWithTotalAndLocationsSchemaList.a9993e3.*` and related responses).
- The attachment thumbnail routes remain unchanged because they always return an image; the only 404 scenario is `GET /api/parts/{part_key}/cover` when no cover exists.

## Implementation Steps
1. **Backend coordination**
   - Add `has_cover_image` to the schemas listed above and expose it on the relevant REST endpoints.
   - Regenerate OpenAPI artifacts and hand the updated spec to the frontend.

2. **Regenerate client**
   - Run `pnpm generate:api` (after receiving the new OpenAPI) to pull the new field into `src/lib/api/generated/**`.

3. **Refactor cover hooks**
   - Update `useCoverAttachment` to accept a `hasCoverImage` hint and avoid making the cover request when false.
   - Ensure `useDuplicatePart` and other consumers forward the flag to keep attachment logic intact.

4. **Update cover renderers**
   - Change `CoverImageDisplay` to accept `hasCoverAttachment`, skip network fetches when false, and render the fallback immediately.
   - Update `Thumbnail` to honor the same flag and remove its defensive `onError` handling (the server never 404s when a thumbnail URL is provided).
   - Ensure callers (e.g., part lists, dashboards) pass the new flag from the list response.

5. **Adjust ancillary components**
   - Update parts detail/document grids so they no longer rely on the cover GET just to discover absence.
   - Simplify `ai-document-preview.tsx` by removing the `onError` handler and `imageError` state; render the preview whenever `image_url` is present.

6. **Tests**
   - Update Playwright specs to stop registering 404 console expectations and, if necessary, assert that we no longer hit the cover endpoint when `has_cover_image` is false.
   - Add coverage verifying that parts with `has_cover_image=false` render the fallback without network errors and `true` still loads the thumbnail.

7. **Cleanup**
   - Remove `retry: false` comments referencing 404s-as-normal where appropriate.
   - Drop any dead code or `onError` fallbacks that existed solely to interpret “no cover” responses.
