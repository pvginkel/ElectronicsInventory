# CAS Migration - Code Review

## 1) Summary & Decision

**Readiness**

The CAS migration implementation successfully replaces client-side URL construction with server-provided CAS URLs. The core logic for URL parameter handling is correct, null handling is thorough, and the implementation follows established project patterns. Test coverage has been appropriately updated to verify CAS URLs rather than old endpoint patterns. The changes are well-structured with clean separation between URL utilities, component updates, and hook simplifications. However, there is one blocking issue: the `Thumbnail` component's fallback logic will show nothing when `previewUrl` is null because `fallbackIcon` is required but not always provided.

**Decision**

`GO-WITH-CONDITIONS` — The implementation is sound except for one **Blocker** (missing fallback icon causing blank display) and one **Major** finding (instrumentation metadata field name inconsistency). Fix the thumbnail fallback issue and align the instrumentation field name, then ship.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- Plan section "Remove obsolete URL construction functions" ↔ `src/lib/utils/thumbnail-urls.ts:21-72` — Old functions removed, new utilities added (`appendThumbnailParam`, `generateSrcSetFromUrl`, `appendDispositionParam`) with correct `?` vs `&` logic.
- Plan section "Update CoverImageDisplay" ↔ `src/components/documents/cover-image-display.tsx:5-11` — Props changed from `hasCoverAttachment` to `coverUrl`, uses `appendThumbnailParam` and `generateSrcSetFromUrl`.
- Plan section "Update Thumbnail component" ↔ `src/components/ui/thumbnail.tsx:4-10` — Props changed from `partKey`/`attachmentId` to `previewUrl`, removed PDF/image branching logic.
- Plan section "Update document-transformers" ↔ `src/lib/utils/document-transformers.ts:39-42` — Uses `doc.previewUrl` and `doc.attachmentUrl` from API instead of constructing URLs.
- Plan section "Simplify use-cover-image hook" ↔ `src/hooks/use-cover-image.ts:6-7` — Removed `useCoverAttachment` query hook, retained mutation hooks.
- Plan section "Update usePartDocuments" ↔ `src/hooks/use-part-documents.ts:27-29` — Maps `preview_url` and `attachment_url` from API schema.
- Plan section "Update all components passing hasCoverAttachment" ↔ Changes in 7 files:
  - `src/components/boxes/part-location-card.tsx:28` — `coverUrl={part.cover_url ?? null}`
  - `src/components/parts/part-card.tsx:28` — `coverUrl={part.cover_url ?? null}`
  - `src/components/parts/part-details.tsx:678` — `coverUrl={part.cover_url}`
  - `src/components/parts/ai-duplicate-card.tsx:82,124` — `coverUrl` with null coalescing
  - `src/components/documents/cover-image-selector.tsx:12` — Prop renamed to `currentCoverAttachmentId`
  - `src/components/parts/part-document-grid.tsx:12` — Prop renamed to `currentCoverAttachmentId`
- Plan section "Update Playwright tests" ↔ Changes in 2 test files:
  - `tests/e2e/parts/part-documents.spec.ts:56-59` — Verifies CAS URL pattern instead of old endpoint
  - `tests/e2e/specific/cover-presence.spec.ts:28-55` — Verifies `cover_url` presence instead of `has_cover_attachment` flag and removed endpoint request tracking

**Gaps / deviations**

- Plan specified `pdfIconSvg` should be kept in `document-tile.tsx` and `add-document-modal.tsx` but removed from `thumbnail.tsx` and `cover-image-display.tsx`. Implementation correctly removes it from `thumbnail.tsx:2` and `cover-image-display.tsx`, but the fallback logic in `thumbnail.tsx:44-47` now renders `{fallbackIcon}` which may be undefined, breaking the plan's intention to show icons when preview is unavailable.
- Plan section "Part detail instrumentation metadata" specified changing `hasCoverAttachment: Boolean(part.cover_attachment)` to `coverUrl: part.cover_url`. Implementation at `src/components/parts/part-details.tsx:184` uses `coverUrl: part.cover_url`, which is correct but doesn't match the original field name pattern. The plan should have clarified whether to keep `hasCoverAttachment` as a boolean derived from `cover_url !== null` for backward compatibility or switch to `coverUrl`.

## 3) Correctness — Findings (ranked)

- Title: `Blocker — Thumbnail fallback icon not provided, causes blank display`
- Evidence: `src/components/ui/thumbnail.tsx:44-47` — When `previewUrl` is null, renders `{fallbackIcon}` without a default, resulting in blank display when callers don't provide `fallbackIcon` prop.
- Impact: Documents and cover images without server-provided `preview_url` will show blank space instead of fallback icon, breaking user expectation that PDFs/unsupported types show an icon.
- Fix: Restore a default fallback icon in `thumbnail.tsx`. Import PDF icon or use `ImagePlaceholderIcon` and render it when both `previewUrl` is null and `fallbackIcon` is not provided: `{fallbackIcon || <img src={pdfIconSvg} alt="No preview" width="40%" height="40%" className="text-muted-foreground" />}`.
- Confidence: High

**Reasoning**: The plan explicitly states to keep `pdfIconSvg` in `document-tile.tsx` for fallback cases. The `Thumbnail` component is used in multiple places (document grid, cover selector) and callers may not provide `fallbackIcon`. Testing scenario: Upload a PDF without server preview → thumbnail will render empty div instead of PDF icon. This breaks the UI contract.

- Title: `Major — Instrumentation metadata field name inconsistency`
- Evidence: `src/components/parts/part-details.tsx:184` — Changes metadata from `hasCoverAttachment: Boolean(part.cover_attachment)` to `coverUrl: part.cover_url`
- Impact: Playwright tests consuming `ListLoading` events for `parts.detail` scope expect `hasCoverAttachment` boolean but now receive `coverUrl` string. This breaks the instrumentation contract unless tests are also updated.
- Fix: Align the field name and type. Either: (1) Keep `hasCoverAttachment: Boolean(part.cover_url)` for backward compatibility, or (2) Update plan and tests to consume `coverUrl` field. Option 1 is safer unless you want to migrate test assertions.
- Confidence: High

**Reasoning**: The plan section "Observability / Instrumentation" (line 341) states the field should change but doesn't specify a migration strategy. Changing the field name and type is a breaking change for test consumers. Current tests don't appear to assert on this metadata field, but future tests or debugging dumps may break.

- Title: `Major — appendDispositionParam utility not used anywhere`
- Evidence: `src/lib/utils/thumbnail-urls.ts:63-72` defines `appendDispositionParam` but no component calls it
- Impact: Dead code. The plan specified it for download URLs (section 2, line 276-279), but no component (DocumentTile, download handlers) currently appends `disposition=attachment`. Attachments may download as inline instead of forcing download.
- Fix: Either: (1) Remove `appendDispositionParam` as YAGNI if backend already sets correct disposition, or (2) Wire it into document download/view flow if backend requires client to specify disposition. Verify backend behavior first.
- Confidence: Medium

**Reasoning**: The plan mentions `appendDispositionParam` but doesn't specify call sites. Looking at `document-transformers.ts:42`, it uses `doc.attachmentUrl` directly without appending disposition. Either the backend pre-bakes disposition into `attachment_url` (making the function unnecessary), or the client is missing download logic.

- Title: `Minor — CoverImageDisplay alt text changed from dynamic to static`
- Evidence: `src/components/documents/cover-image-display.tsx:64` — Changed from `alt={coverAttachment.title}` to `alt="Part cover image"`
- Impact: Accessibility regression; screen reader users lose specific cover image description.
- Fix: Pass `alt` as a prop or derive it from part data: `alt={part.name || 'Part cover image'}`. Requires prop threading from parent components.
- Confidence: Medium

**Reasoning**: The original code used `coverAttachment.title` which provided context-specific alt text. The new static string is less accessible. Not blocking but worth addressing for a11y compliance.

- Title: `Minor — Thumbnail component error state lost`
- Evidence: `src/components/ui/thumbnail.tsx:38` — `onError={handleImageError}` calls `setIsLoading(false)` but doesn't track error state, so failed images still show spinner div
- Impact: Users see spinner overlay on broken images instead of fallback icon
- Fix: Add error state tracking: `const [hasError, setHasError] = useState(false)`, update `handleImageError` to `setHasError(true)`, and conditionally render fallback when `hasError === true`.
- Confidence: Low (existing behavior, not introduced by this change, but worth noting)

**Reasoning**: The `onError` handler clears loading state but the component still tries to render the `<img>` element. If the image fails to load, the user sees a broken image instead of falling back gracefully. This was true before the CAS migration but is more visible now with server-provided preview URLs.

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: `src/lib/utils/thumbnail-urls.ts`
- Evidence: `appendThumbnailParam` and `appendDispositionParam` duplicate the `?` vs `&` separator logic (lines 34-35, 70-71)
- Suggested refactor: Extract a shared helper:
  ```typescript
  function appendQueryParam(baseUrl: string | null, key: string, value: string | number): string | null {
    if (baseUrl === null) return null;
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${key}=${value}`;
  }
  export function appendThumbnailParam(baseUrl: string | null, size: number): string | null {
    return appendQueryParam(baseUrl, 'thumbnail', size);
  }
  export function appendDispositionParam(baseUrl: string | null, disposition: 'inline' | 'attachment'): string | null {
    return appendQueryParam(baseUrl, 'disposition', disposition);
  }
  ```
- Payoff: DRY principle, easier to test URL parameter logic in isolation, reduces risk of divergence between functions

- Hotspot: `src/hooks/use-part-documents.ts:29`
- Evidence: Computes `has_image: attachment.preview_url !== null` which duplicates the null check already present in `previewUrl` field
- Suggested refactor: Remove `has_image` from the returned document model; consumers can check `previewUrl !== null` directly. If backward compatibility is needed, keep it but add a comment explaining why.
- Payoff: Reduces derived state, clarifies that `previewUrl` is the source of truth for preview availability

- Hotspot: `src/components/documents/cover-image-display.tsx:23-26`
- Evidence: `useEffect` resets `imageError` on every `coverUrl` change, which is appropriate, but the pattern is repeated in other image components
- Suggested refactor: Extract a `useImageLoading(url)` custom hook that encapsulates loading/error state and reset logic. Reuse across `CoverImageDisplay`, `Thumbnail`, and other image components.
- Payoff: Consistent error handling, reduces boilerplate in components, easier to add features like retry logic

## 5) Style & Consistency

- Pattern: Inconsistent null coalescing for `coverUrl` prop
- Evidence:
  - `src/components/boxes/part-location-card.tsx:28` — `coverUrl={part.cover_url ?? null}`
  - `src/components/parts/part-card.tsx:28` — `coverUrl={part.cover_url ?? null}`
  - `src/components/parts/part-details.tsx:678` — `coverUrl={part.cover_url}` (no null coalescing)
- Impact: Inconsistent handling; `part.cover_url` is already typed as `string | null` from the API, so `?? null` is redundant, but omitting it in one place suggests uncertainty about the type contract.
- Recommendation: Remove `?? null` from all call sites since `cover_url` is already nullable. If TypeScript requires it due to strictNullChecks, add a comment explaining why.

- Pattern: URL parameter check uses string `includes('?')` instead of URL parsing
- Evidence: `src/lib/utils/thumbnail-urls.ts:34` — `const separator = baseUrl.includes('?') ? '&' : '?';`
- Impact: Fragile for URLs with fragments (e.g., `#section`) or malformed query strings. Edge case: URL like `/api/cas/abc#?fragment` will incorrectly append `&thumbnail=...` instead of `?thumbnail=...`.
- Recommendation: For production robustness, use URL parsing:
  ```typescript
  const url = new URL(baseUrl, 'http://dummy');
  const separator = url.search ? '&' : '?';
  ```
  However, CAS URLs from backend are controlled and unlikely to have fragments. Document the assumption: "Assumes baseUrl is a valid path without fragments."

- Pattern: Removed loading state from `CoverImageDisplay` but retained it in `Thumbnail`
- Evidence: `src/components/documents/cover-image-display.tsx` no longer checks `isLoading` from query, while `src/components/ui/thumbnail.tsx:20` still tracks image loading state
- Impact: Consistency — both components render images from URLs, but only `Thumbnail` shows loading spinner
- Recommendation: Decide on a consistent pattern: either both components show loading state for image elements, or neither does (relying on browser native loading). The current mix is confusing.

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: CAS URL usage in cover images and thumbnails
- Scenarios:
  - Given a part with `cover_url`, When part list loads, Then cover image src should match CAS URL pattern (`tests/e2e/specific/cover-presence.spec.ts:46`)
  - Given a part without `cover_url`, When part list loads, Then cover placeholder should display (`tests/e2e/specific/cover-presence.spec.ts:48`)
  - Given an attachment with `preview_url`, When document grid loads, Then thumbnail src should contain `/api/cas/` (`tests/e2e/parts/part-documents.spec.ts:56-59`)
- Hooks: `parts.coverImage()`, `parts.coverPlaceholder()`, `partsDocuments.previewImage()`, `testData.parts.getDetail()` to verify `cover_url` presence
- Gaps:
  - No test for URL parameter appending logic (e.g., verify `?thumbnail=300` is appended correctly). Consider unit tests for `thumbnail-urls.ts` utilities if edge cases exist.
  - No test for instrumentation metadata change from `hasCoverAttachment` to `coverUrl` (see Major finding above).
  - No test for fallback icon display when `preview_url` is null (would catch the Blocker finding).
- Evidence: `tests/e2e/parts/part-documents.spec.ts:56-59`, `tests/e2e/specific/cover-presence.spec.ts:28-55`

- Surface: Cover endpoint removal
- Scenarios:
  - Given the cover endpoint is removed, When parts load, Then no requests to `/api/parts/{key}/cover` should occur
- Hooks: Response listener removed from `cover-presence.spec.ts:36-59` (old implementation tracked endpoint requests)
- Gaps: Test no longer verifies that the old endpoint is *not* called. While the code doesn't call it, a regression test asserting zero requests to the old pattern would document the migration intent.
- Evidence: `tests/e2e/specific/cover-presence.spec.ts` — Request tracking logic removed

- Surface: Part detail instrumentation metadata
- Scenarios:
  - Given a part with `cover_url`, When part detail loads, Then `ListLoading` event for `parts.detail` scope should include `coverUrl` field
- Hooks: `waitForListLoading(page, 'parts.detail', 'ready')` with metadata assertions
- Gaps: No test currently asserts on the instrumentation metadata for `coverUrl` vs `hasCoverAttachment`. Add a test or update existing coverage to verify the new metadata shape.
- Evidence: `src/components/parts/part-details.tsx:184`

## 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)

- Title: `Major — URL with fragment breaks parameter appending logic`
- Evidence: `src/lib/utils/thumbnail-urls.ts:34` — `baseUrl.includes('?')` checks for query string but doesn't account for URL fragments
- Attack: Backend returns a CAS URL like `/api/cas/abc#?section`. The `includes('?')` check finds `?` and appends `&thumbnail=300`, resulting in `/api/cas/abc#?section&thumbnail=300` which is malformed (params should come before fragment).
- Impact: Image fails to load due to malformed URL
- Mitigation: Backend CAS URLs should not contain fragments (document this assumption in code comment), or parse URL properly using `URL` constructor as suggested in Style section.
- Confidence: Low (unlikely in practice since CAS URLs are server-controlled and don't include fragments, but technically possible)

- Title: `Minor — Concurrent cover_url updates cause race in image rendering`
- Evidence: `src/components/documents/cover-image-display.tsx:23-26` — `useEffect` resets `imageError` when `coverUrl` changes, but rapid updates could cause stale image to flash
- Attack: User rapidly sets different attachments as cover. Backend invalidates part query, refetch returns new `cover_url`, but previous `<img>` element is still loading. The new URL triggers render before old image errors, causing brief flash of wrong image.
- Impact: UX glitch; user sees wrong cover briefly
- Mitigation: Use `key={coverUrl}` on `<img>` element (already present: `key="cover-${partId}-${coverUrl}"`) to force React to unmount old image. This is already mitigated.
- Confidence: Low (code already handles this correctly)

- Title: `Minor — generateSrcSetFromUrl creates invalid srcSet if baseUrl is empty string`
- Evidence: `src/lib/utils/thumbnail-urls.ts:43-54` — If `baseUrl` is `''` (empty string instead of null), function returns srcSet like ` ?thumbnail=150 150w, ...` with leading space and malformed URLs.
- Attack: Backend bug or API schema mismatch returns `attachment_url: ''` instead of `null`. Client treats empty string as truthy and generates invalid srcSet.
- Impact: Image fails to load
- Mitigation: Add guard at start of function: `if (!baseUrl || baseUrl === null) return '';`. Or normalize empty strings to null in the hook that maps API responses.
- Confidence: Medium (edge case but possible if backend validation is weak)

**Additional checks attempted:**
- **Query/cache usage**: Verified that removing `useCoverAttachment` query doesn't break cache invalidation. Mutation hooks (`useSetCoverAttachment`, `useRemoveCoverAttachment`) still invalidate part query cache, so cover updates trigger refetch of `cover_url`. No issue found.
- **Instrumentation & selectors**: Verified that `data-testid` attributes are stable (`data-document-id`, `data-preview-image` added in `document-tile.tsx:124-125`). No breaking changes to selectors. Instrumentation metadata change flagged as Major finding above.
- **Performance traps**: `generateSrcSetFromUrl` maps over 3 sizes (small/medium/large) which is O(1) and not a concern. No unnecessary re-renders detected; components correctly use `useMemo` and `useEffect` dependencies.

## 8) Invariants Checklist (table)

- Invariant: If `cover_url` is non-null, part has a cover attachment assigned
  - Where enforced: Backend schema validation (`PartWithTotalSchema` populates `cover_url` only when `cover_attachment_id` is set)
  - Failure mode: Backend returns `cover_url` but `cover_attachment_id` is null, causing inconsistency in cover selector modal (can't highlight current cover)
  - Protection: Backend responsibility; frontend assumes schema integrity. Component `cover-image-selector.tsx:12` receives `currentCoverAttachmentId` and uses it to highlight current cover.
  - Evidence: `src/components/documents/cover-image-selector.tsx:12`, backend schema in `openapi-cache/openapi.json:5772-5799`

- Invariant: URL parameter appending preserves URL validity (no double `?` or malformed query strings)
  - Where enforced: `src/lib/utils/thumbnail-urls.ts:34-35` — `baseUrl.includes('?')` check ensures correct separator
  - Failure mode: If `baseUrl` already ends with `?` or contains malformed query string, appending could create invalid URL like `url?&thumbnail=300`
  - Protection: String-based check is fragile but sufficient for server-controlled CAS URLs. Backend guarantees valid base URLs.
  - Evidence: `src/lib/utils/thumbnail-urls.ts:30-36`, adversarial sweep identified edge case with fragments

- Invariant: `preview_url === null` means no preview available; fallback icon must display
  - Where enforced: `src/components/ui/thumbnail.tsx:42-47` — Conditional render when `!previewUrl`
  - Failure mode: If `fallbackIcon` prop is not provided, component renders empty div (Blocker finding above)
  - Protection: None; fallback logic requires callers to provide `fallbackIcon` or component must supply default
  - Evidence: `src/components/ui/thumbnail.tsx:42-47`, Blocker finding in section 3

- Invariant: Setting cover attachment triggers cache invalidation and refetch of `cover_url`
  - Where enforced: `src/hooks/use-cover-image.ts:9-13` — `useSetCoverAttachment` mutation invalidates part query cache via TanStack Query onSuccess callback
  - Failure mode: If mutation succeeds but cache invalidation fails, UI shows stale `cover_url`
  - Protection: TanStack Query handles invalidation; mutation hooks follow standard pattern. Manual verification needed to confirm onSuccess callback is wired correctly.
  - Evidence: `src/hooks/use-cover-image.ts:9-13`, generated mutation hook in API client

## 9) Questions / Needs-Info

- Question: Does backend guarantee `cover_url` and `attachment_url` never contain URL fragments?
- Why it matters: URL parameter appending logic assumes no fragments; if backend CAS URLs include `#section`, the `?` vs `&` logic breaks (see adversarial sweep)
- Desired answer: Backend contract documentation or assertion that CAS URLs are always path + query params only, no fragments

- Question: Should `appendDispositionParam` be used for download links, or does backend pre-bake disposition into `attachment_url`?
- Why it matters: Function is defined but unused (Major finding); unclear if it's dead code or missing implementation
- Desired answer: Backend API documentation specifying whether client must append `&disposition=attachment` for downloads, or if `attachment_url` already includes it

- Question: What is the migration strategy for instrumentation metadata field name change from `hasCoverAttachment` to `coverUrl`?
- Why it matters: Breaking change for test consumers and debugging tools that parse `ListLoading` events (Major finding)
- Desired answer: Confirm whether to keep backward-compatible field name (`hasCoverAttachment: Boolean(part.cover_url)`) or migrate tests to consume `coverUrl` field

- Question: Are there any parts in the production database with `cover_attachment_id` set but `cover_url` null?
- Why it matters: Invariant assumes backend always populates `cover_url` when cover is set; if migration is incomplete, UI will show placeholders instead of covers
- Desired answer: Database query confirming zero parts with `cover_attachment_id IS NOT NULL AND cover_url IS NULL`, or migration plan if inconsistencies exist

## 10) Risks & Mitigations (top 3)

- Risk: Thumbnail fallback icon missing causes blank display for documents without preview
- Mitigation: Restore default fallback icon in `Thumbnail` component (`pdfIconSvg` or `ImagePlaceholderIcon`). See Blocker finding in section 3.
- Evidence: `src/components/ui/thumbnail.tsx:44-47`, plan section 12 lines 413-417

- Risk: Instrumentation metadata field name change breaks Playwright tests or debugging tools
- Mitigation: Align field name with plan and verify test compatibility. Either keep `hasCoverAttachment` as boolean or update all consumers to use `coverUrl`. See Major finding in section 3.
- Evidence: `src/components/parts/part-details.tsx:184`, plan section 9 lines 336-341

- Risk: URL parameter appending fails for edge cases (empty strings, fragments, malformed URLs)
- Mitigation: Add defensive checks in `appendThumbnailParam` and `generateSrcSetFromUrl` to handle empty strings and malformed inputs. Document backend contract that CAS URLs are always valid paths without fragments. Consider unit tests for URL utilities.
- Evidence: `src/lib/utils/thumbnail-urls.ts:30-54`, adversarial sweep findings

## 11) Confidence

Confidence: High — The implementation correctly migrates from client-side URL construction to server-provided CAS URLs with proper null handling and URL parameter logic. The blocker (missing fallback icon) is easily fixable, and the major issues (instrumentation metadata, unused utility function) are clarifications rather than fundamental flaws. Test coverage has been appropriately updated to verify CAS URL patterns. The change is well-aligned with the plan and follows project conventions for hooks, components, and error handling.
