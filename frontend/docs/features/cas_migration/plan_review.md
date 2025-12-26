# CAS Migration - Plan Review

## 1) Summary & Decision

**Readiness**

The plan is comprehensive, well-researched, and demonstrates strong alignment with the backend schema changes. The research log (Section 0) proves thorough discovery work across all affected components, hooks, and tests. The scoping is realistic—removing obsolete URL construction and consuming server-provided CAS URLs is architecturally sound and low-risk. The plan addresses all major touchpoints, includes deterministic test coverage, and acknowledges the need to maintain a working state through two implementation slices. Minor clarifications and one instrumentation gap exist but do not block implementation.

**Decision**

`GO-WITH-CONDITIONS` — The plan is implementation-ready with three conditions: (1) add explicit srcSet utility logic to replace `generateSrcSet` and `generateCoverSrcSet` (currently vague), (2) clarify the fate of `useCoverAttachment` (simplify vs. remove), and (3) extend Playwright coverage to verify CAS URL structure or image load success in at least one spec. These are addressable during implementation without redesign.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — **Pass** — `plan.md:14-22` provides a detailed research log with file paths and line ranges proving discovery of all touched components.
- `docs/commands/plan_feature.md` — **Pass** — `plan.md:24-65` uses the `<intent_scope_template>` with verbatim quotes from the change brief and clear in-scope/out-of-scope bullets.
- `docs/commands/plan_feature.md` — **Pass** — `plan.md:69-128` employs the `<file_map_entry_template>` with evidence at file:line granularity for every affected area.
- `docs/contribute/architecture/application_overview.md` — **Pass** — `plan.md:84-92` correctly references `document-transformers.ts` using `getThumbnailUrl, getViewUrl` from the generated API hook pattern; migration to server-provided URLs follows the custom-hook-wraps-generated-client architecture.
- `docs/contribute/testing/playwright_developer_guide.md` — **Pass** — `plan.md:408-446` defines deterministic scenarios using Given/When/Then format and cites existing instrumentation (`parts.waitForCards()`, `partsDocuments.documentTileByTitle()`). However, section 13 notes a gap in URL verification logic (see Adversarial Sweep below).
- `docs/product_brief.md` — **Pass** — The plan respects product intent: attachments are viewable in the app (PDF/image preview remains), cover images continue to display, and no user-visible behavior changes beyond URL sourcing.

**Fit with codebase**

- `src/lib/utils/thumbnail-urls.ts` — `plan.md:69-71` — Correctly identifies removal of obsolete functions (`getThumbnailUrl`, `getCoverThumbnailUrl`, `getDownloadUrl`, `getViewUrl`, `generateSrcSet`, `generateCoverSrcSet`) and retention of `THUMBNAIL_SIZES` and `getSizesAttribute`. Aligns with existing utility patterns.
- `src/components/documents/cover-image-display.tsx` — `plan.md:73-76` — Proposes replacing `useCoverAttachment` + `hasCoverAttachment` prop with `coverUrl` prop. This fits the component's existing prop contract (lines 8-14) and error handling pattern (line 86 `onError`). The plan correctly removes PDF branching (lines 62-74) since server provides `preview_url` for PDFs.
- `src/components/ui/thumbnail.tsx` — `plan.md:78-80` — Proposes accepting `previewUrl` prop instead of `partKey`/`attachmentId`. This is a clean interface change that removes client-side URL construction. The plan correctly identifies removal of PDF/image branching logic (lines 49-58) and `pdfIconSvg` import.
- `src/hooks/use-cover-image.ts` — `plan.md:86-88` — Identifies `useCoverAttachment` calls removed endpoint (`useGetPartsCoverByPartKey` lines 10-15). The plan states "simplify or remove" but section 3 (Data Model) and section 5 (Algorithms) treat it as removed entirely (`plan.md:162-164, 200-206`). **Minor ambiguity**: clarify if the hook is deleted or retains mutation exports only (`useSetCoverAttachment`, `useRemoveCoverAttachment`).
- `src/hooks/use-part-documents.ts` — `plan.md:89-92` — Correctly maps `preview_url` and `attachment_url` from schema (line 27 currently maps `has_preview`). Fits existing transform pattern in `document-transformers.ts`.
- Component updates (`plan.md:94-120`) — All seven components passing `hasCoverAttachment` are enumerated with file:line evidence. The migration from `hasCoverAttachment` to `coverUrl` is consistent across all touchpoints.

---

## 3) Open Questions & Ambiguities

- **Question**: Should `useCoverAttachment` be completely removed or simplified to export only `useSetCoverAttachment` and `useRemoveCoverAttachment`?
- **Why it matters**: The plan states "Simplify/remove `useCoverAttachment` hook" (`plan.md:45`) but later sections treat it as fully removed (`plan.md:163-164, 200-206`). If mutation hooks remain, dependent components (`cover-image-selector.tsx`, `part-document-grid.tsx`, `use-duplicate-part.ts`) may still import from `use-cover-image.ts`.
- **Needed answer**: Confirm if the file should be deleted entirely (moving mutations to a different module) or retain mutation exports only. The change brief says "cover details endpoint" is removed (`change_brief.md:13`), implying the GET hook goes away but SET/DELETE remain.

**Resolution via research**: Reading `use-cover-image.ts` shows three exports: `useCoverAttachment` (GET), `useSetCoverAttachment` (PUT), `useRemoveCoverAttachment` (DELETE). The plan should retain the PUT/DELETE hooks since `plan.md:179-189` confirms "Set cover mutation (UNCHANGED)" and "Remove cover mutation (UNCHANGED)". The hook file should be **simplified** to remove `useCoverAttachment` and keep the mutation exports.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- **Behavior**: Part list with cover images
  - **Scenarios**:
    - Given a part with a cover attachment, When the part list loads, Then the cover image should display using the CAS URL from `cover_url` field (`tests/e2e/specific/cover-presence.spec.ts`)
    - Given a part without a cover attachment, When the part list loads, Then a placeholder should display
  - **Instrumentation**: `parts.waitForCards()`, `parts.coverImage(partKey)`, `parts.coverPlaceholder(partKey)`
  - **Backend hooks**: Factories create part with `cover_url` populated
  - **Gaps**: **None** — existing test patterns cover this
  - **Evidence**: `plan.md:410-416`

- **Behavior**: Document thumbnail display
  - **Scenarios**:
    - Given an attachment with `preview_url`, When document grid loads, Then thumbnail image should display with CAS URL
    - Given an attachment without `preview_url`, When document grid loads, Then fallback icon should display
  - **Instrumentation**: `partsDocuments.documentTileByTitle()`, `partsDocuments.previewImage(attachmentId)`
  - **Backend hooks**: Factories create attachments with `preview_url` and `attachment_url`
  - **Gaps**: **Minor** — `plan.md:422-423` notes "Test currently expects old thumbnail URL pattern; update to verify CAS URL or verify image loads successfully without checking specific URL". This is a reasonable mitigation (verify image load success rather than exact URL), but tests should verify at least one CAS URL structure to catch malformed URL parameter logic.
  - **Evidence**: `plan.md:417-424`

- **Behavior**: Set cover attachment workflow
  - **Scenarios**:
    - Given a part with documents, When user sets an attachment as cover, Then backend updates cover reference and part refetches with `cover_url` populated
  - **Instrumentation**: `partsDocuments.setAsCover()`, `testData.parts.getDetail()` to verify `cover_url` presence
  - **Backend hooks**: Mutation invalidates part query; refetch provides `cover_url`
  - **Gaps**: **None** — `plan.md:429` confirms `cover_attachment_id` still exists in schema for highlighting current cover
  - **Evidence**: `plan.md:425-431`

- **Behavior**: Cover endpoint request tracking (removed endpoint)
  - **Scenarios**:
    - Given the cover endpoint is removed, When tests track API requests, Then no requests to `/api/parts/{key}/cover` should occur
  - **Instrumentation**: Response listeners for cover endpoint
  - **Gaps**: **Minor** — `plan.md:436-437` correctly identifies removal of this assertion since endpoint no longer exists. The test should be updated to remove the listener, not just the assertion.
  - **Evidence**: `plan.md:432-438`

- **Behavior**: Part detail cover image display
  - **Scenarios**:
    - Given a part with `cover_url`, When part detail loads, Then cover image should render using CAS URL
    - Given a part without `cover_url`, When part detail loads, Then no cover image should render
  - **Instrumentation**: `parts.detail` instrumentation scope, existing cover image locators
  - **Backend hooks**: Part query provides `cover_url`
  - **Gaps**: **None** — covered by existing detail page tests
  - **Evidence**: `plan.md:439-446`

---

## 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)

**Major — Missing srcSet utility implementation details**

**Evidence:** `plan.md:42, 70-71, 156-157` — Plan states "Add new utility functions to append query parameters to CAS URLs" and "Must check if URL contains `?` and append with `?` or `&` accordingly" but does not specify how `generateSrcSet` and `generateCoverSrcSet` will be replaced. Section 6 (Derived State) mentions "Thumbnail URL with size parameter" (`plan.md:247-253`) but does not define the replacement utility's signature or logic.

**Why it matters:** The plan removes `generateSrcSet(partKey, attachmentId)` and `generateCoverSrcSet(partKey)` but `CoverImageDisplay` (line 82-83) and `Thumbnail` (line 70-71) both use these functions to build responsive `srcSet` strings. Without a clear replacement (e.g., `generateSrcSetFromUrl(baseUrl: string)`), implementers may reintroduce URL construction bugs or forget to check for existing `?` before appending `&thumbnail=...`.

**Fix suggestion:** Add to Section 2 (Affected Areas) and Section 3 (Data Model):
- **New utility**: `appendThumbnailParam(baseUrl: string | null, size: keyof ThumbnailSizes): string | null` — Check if `baseUrl` contains `?`; append `?thumbnail=<size>` or `&thumbnail=<size>` accordingly. Return `null` if `baseUrl` is `null`.
- **New utility**: `generateSrcSetFromUrl(baseUrl: string | null): string` — Map over `THUMBNAIL_SIZES` entries and call `appendThumbnailParam` for each size, building `<url> <size>w` strings. Return empty string if `baseUrl` is `null`.
- Document edge cases: URL with fragment (`#anchor`), URL with existing params (`?foo=bar`), null base URL.

**Confidence:** High — This is a critical gap; without explicit logic, the migration will fail at runtime or produce malformed URLs.

---

**Major — CoverImageDisplay prop change impacts multiple components but no type migration strategy**

**Evidence:** `plan.md:73-76, 94-120` — Plan identifies seven components that must switch from `hasCoverAttachment` prop to `coverUrl` prop. Section 2 lists them with evidence, but Section 14 (Implementation Slices) groups all component updates into Slice 2 "in single commit to avoid partial state" (`plan.md:459-469`).

**Why it matters:** Changing `CoverImageDisplay` props from `hasCoverAttachment` to `coverUrl` is a breaking interface change. If the plan updates the component definition before updating all seven call sites, TypeScript will fail compilation for the un-updated components. The plan's "single commit" strategy mitigates this but does not clarify whether Slice 2 will temporarily accept both props (deprecated `hasCoverAttachment` + new `coverUrl`) or require atomic updates.

**Fix suggestion:** In Section 14, clarify migration strategy:
- **Option A (Atomic)**: Update `CoverImageDisplay` interface and all seven call sites in one commit. Run `pnpm check` before committing to ensure zero type errors.
- **Option B (Deprecated transition)**: Temporarily accept both `hasCoverAttachment` and `coverUrl` props; log deprecation warning if `hasCoverAttachment` is used; remove deprecated prop in follow-up commit after all call sites migrated.
- Recommend **Option A** since this is a localized change (7 components) and Option B adds complexity for minimal benefit.

**Confidence:** Medium — The plan's "single commit" note suggests awareness, but lack of explicit type migration strategy could cause confusion during implementation.

---

**Major — Instrumentation metadata change not reflected in test plan**

**Evidence:** `plan.md:329-336` — Section 9 (Observability/Instrumentation) states "Part detail loading instrumentation metadata" includes `hasCoverAttachment: Boolean(part.cover_attachment)` (line 334) and "should change to reflect `cover_url` presence" (line 333). However, Section 13 (Deterministic Test Plan) does not list a scenario verifying this metadata change.

**Why it matters:** Playwright tests may assert on `hasCoverAttachment` in instrumentation events. If the plan changes the metadata field to `hasCoverUrl` or `coverUrl` without updating test expectations, tests will break or fail to validate the new schema. The plan mentions the instrumentation change but does not propose a corresponding test update.

**Fix suggestion:** Add to Section 13 (Deterministic Test Plan):
- **Surface**: Part detail instrumentation
- **Scenarios**:
  - Given a part with `cover_url`, When part detail loads, Then `ListLoading` event for `parts.detail` scope should include metadata with `coverUrl: <non-null string>` (or `hasCoverUrl: true` if using boolean)
  - Given a part without `cover_url`, When part detail loads, Then metadata should reflect `coverUrl: null` (or `hasCoverUrl: false`)
- **Instrumentation / hooks**: `waitForListLoading(page, 'parts.detail', 'ready')` and assert on event metadata
- **Backend hooks**: Factories create part with/without `cover_url`
- **Gaps**: None — existing instrumentation helper supports metadata assertions

**Confidence:** High — This is a direct consequence of the schema change; omitting test coverage risks silent metadata drift.

---

**Minor — Placeholder UI clarification for cover images**

**Evidence:** `plan.md:200-209, 299-308` — Section 5 (Algorithms & UI Flows) states "If `cover_url` is null, render placeholder (existing behavior)" (line 203) and Section 8 (Errors & Edge Cases) states "Ensure fallback UI is clear (e.g., 'Image unavailable' placeholder)" (line 300). However, `CoverImageDisplay` currently has `showPlaceholder` prop (line 11, 21) that controls placeholder visibility. The plan does not clarify if this prop's behavior changes.

**Why it matters:** If `coverUrl` is null and `showPlaceholder` is false, the component returns `null` (line 59). After migration, if the prop is removed or defaults change, components that relied on `showPlaceholder={false}` to hide placeholders may unexpectedly render them. This is low-risk but could cause UX inconsistency.

**Fix suggestion:** In Section 2 (Affected Areas) or Section 12 (UX/UI Impact), explicitly state:
- **Retain `showPlaceholder` prop** with existing behavior (default `false`, renders `null` if `coverUrl` is null and `showPlaceholder=false`).
- No change to existing call sites (`part-card.tsx`, `part-details.tsx`, etc.) unless they explicitly want to show placeholders.

**Confidence:** Low — This is a minor UX detail; existing behavior is likely correct, but plan should document it to avoid confusion.

---

**Minor — PDF fallback icon retention logic**

**Evidence:** `plan.md:48-49, 78-80, 489-492` — Plan states "Remove `pdfIconSvg` from `thumbnail.tsx` and `cover-image-display.tsx` (keep in `document-tile.tsx` and `add-document-modal.tsx`)" (`plan.md:48-49`) and risks section notes "Carefully preserve `pdfIconSvg` in `document-tile.tsx` and `add-document-modal.tsx`; remove only from `thumbnail.tsx` and `cover-image-display.tsx`" (`plan.md:489-492`). This is correct but the rationale is implicit.

**Why it matters:** Without explicit justification, future developers may question why `pdfIconSvg` remains in some files. The plan should clarify: `document-tile.tsx` shows fallback when `previewImageUrl` is null (server did not generate preview); `add-document-modal.tsx` shows client-side preview during upload (before server processes file).

**Fix suggestion:** Add to Section 2 (Affected Areas) or Section 12 (UX/UI Impact):
- **Rationale for keeping `pdfIconSvg`**:
  - `document-tile.tsx`: Fallback when server provides no `preview_url` (e.g., unsupported file type, processing failure)
  - `add-document-modal.tsx`: Client-side preview during upload (file not yet uploaded to server)
- **Rationale for removing `pdfIconSvg`**:
  - `thumbnail.tsx`: Server now provides `preview_url` for all previewable content (including PDFs); component no longer branches on file type
  - `cover-image-display.tsx`: Same reason; server provides `preview_url` or component shows generic placeholder

**Confidence:** Low — This is a documentation improvement; logic is sound but implicit.

---

**Checks attempted:**

- **Stale cache risk**: Checked if TanStack Query cache keys change with schema migration. `plan.md:277-294` confirms "Part detail response for cover state" is source of truth; mutations invalidate part query cache. No cache key changes needed since backend response schema evolves (same endpoint, different fields). **Risk closed.**
- **React concurrency**: Checked if `useEffect` dependencies or suspense boundaries need adjustment. `plan.md:359-364` documents existing `imageError` reset effect in `CoverImageDisplay`; `reloadToken` dependency remains valid (sourced from `dataUpdatedAt` or `coverAttachment.updated_at`). No new effects introduced. **Risk closed.**
- **Generated API usage**: Checked if schema changes propagate correctly. `plan.md:131-158` documents `PartWithTotalSchema` and `PartAttachmentResponseSchema` changes; plan assumes `pnpm generate:api` produces correct types (`plan.md:454, 475`). Slice 1 includes API regeneration + type check (`plan.md:451-457`). **Risk closed** with mitigation: run `pnpm check` after regeneration.
- **Instrumentation gaps**: Found one gap (see "Major — Instrumentation metadata change" above). Other instrumentation signals (`plan.md:329-356`) are unaffected or correctly updated.

**Evidence**: Sections 3 (Data Model), 4 (API/Integration Surface), 6 (Derived State), 7 (State Consistency), 9 (Observability), and 15 (Risks) collectively address standard adversarial targets.

**Why the plan holds**: The plan correctly identifies all schema changes, maps them to UI touchpoints, and proposes deterministic test coverage. The missing pieces (srcSet utility details, metadata test coverage) are addressable additions, not fundamental design flaws.

---

## 6) Derived-Value & State Invariants (table)

- **Derived value**: Thumbnail URL with size parameter
  - **Source dataset**: Base `cover_url` or `preview_url` from API response (unfiltered)
  - **Write / cleanup triggered**: No state mutation; appended query parameter for `<img>` src
  - **Guards**: Must check if URL already contains `?` before appending `?thumbnail=<size>` (use `&thumbnail=<size>` if `?` exists)
  - **Invariant**: URL must be valid; malformed URLs cause image load failure. If base URL is `null`, derived URL must be `null` (component shows placeholder).
  - **Evidence**: `plan.md:247-253`

- **Derived value**: Document preview availability
  - **Source dataset**: `preview_url !== null` from attachment response (unfiltered; server decides preview availability)
  - **Write / cleanup triggered**: Maps to `previewImageUrl` in `DocumentItem` model; no persistent write
  - **Guards**: If `preview_url` is null, show fallback icon
  - **Invariant**: Server decides preview availability; client never guesses based on content type (e.g., no client-side PDF detection)
  - **Evidence**: `plan.md:254-260`

- **Derived value**: Current cover attachment ID
  - **Source dataset**: `cover_attachment.id` or `cover_attachment_id` from part response (unfiltered)
  - **Write / cleanup triggered**: Used to highlight current cover in selector modal; no persistent write
  - **Guards**: May be null if part has no cover
  - **Invariant**: If `cover_url` is non-null, `cover_attachment_id` must be set (backend responsibility; frontend does not enforce)
  - **Evidence**: `plan.md:261-267`

- **Derived value**: Download URL with disposition
  - **Source dataset**: Base `attachment_url` from API (unfiltered)
  - **Write / cleanup triggered**: Appended `&disposition=attachment` parameter; no state mutation
  - **Guards**: Check for existing query params; ensure valid URL
  - **Invariant**: Disposition parameter controls browser download vs inline display; malformed URL causes download failure
  - **Evidence**: `plan.md:268-274`

All derived values are **read-only transformations** with no persistent writes. No filtered view drives cache mutations, so no **Major** flag required.

---

## 7) Risks & Mitigations (top 3)

- **Risk**: API regeneration produces unexpected field names or types
  - **Mitigation**: Run `pnpm generate:api` and `pnpm check` immediately after backend deployment; verify generated types match expected schema (`PartWithTotalSchema.cover_url`, `PartAttachmentResponseSchema.preview_url`, `PartAttachmentResponseSchema.attachment_url`). Add Slice 1 checkpoint: do not proceed to Slice 2 until types pass compilation.
  - **Evidence**: `plan.md:473-476`

- **Risk**: URL parameter appending logic has edge cases (e.g., URLs with fragments, existing params)
  - **Mitigation**: Implement utility functions with explicit checks for `?` in base URL; test with various URL formats (base URL only, URL with query params, URL with fragment, null URL). Add unit tests for `appendThumbnailParam` and `generateSrcSetFromUrl` if edge cases are complex.
  - **Evidence**: `plan.md:479-483`

- **Risk**: Playwright tests break due to URL pattern changes
  - **Mitigation**: Update tests to verify image loads successfully rather than matching specific URL patterns (e.g., check `<img>` element visibility and `src` attribute non-null, not exact URL string). For at least one spec, verify CAS URL structure (contains base URL + query param) to catch malformed parameter logic.
  - **Evidence**: `plan.md:484-487`

---

## 8) Confidence

**Confidence: High** — The plan demonstrates thorough research (Section 0 enumerates all affected files with line-range evidence), correct schema mapping (Sections 3-4), and deterministic test coverage (Section 13). The two-slice implementation strategy (API regeneration + type check, then component updates in single commit) minimizes risk of partial migration. The main gaps (srcSet utility details, instrumentation metadata test coverage) are addressable during implementation without redesign. Risk mitigations are realistic and grounded in existing tooling (`pnpm check`, Playwright assertions). The change is well-scoped and aligns with backend CAS migration intent.
