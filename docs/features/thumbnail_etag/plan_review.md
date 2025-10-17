### 1) Summary & Decision
The plan targets the right layers and test suites but leaves contradictory instructions for SVG fallbacks and omits coverage for the cover thumbnail endpoint, so it is not ready as written. **Decision: GO-WITH-CONDITIONS** — resolve the icon ETag inconsistency and flesh out API coverage.

### 2) Conformance & Fit (with evidence)
- **Conformance to refs**
  - Product brief — Pass. “Implement ETag support for the thumbnail delivery endpoints…” (docs/features/thumbnail_etag/plan.md:2-3) keeps attachments fast and viewable per docs/product_brief.md §10.
  - Feature planning checklist — Pass. “Relevant files and functions: … `app/services/document_service.py:get_attachment_thumbnail` … `app/api/documents.py:get_attachment_thumbnail` …” (docs/features/thumbnail_etag/plan.md:5-8) enumerates concrete touch-points as required by docs/commands/plan_feature.md.
  - Backend layering & testing guidelines — Pass. “Calculate the ETag in `DocumentService.get_attachment_thumbnail`…” and “…short-circuit with 304…” (docs/features/thumbnail_etag/plan.md:12-13) keep logic in services and HTTP handling in the API module, plus Step 4 commits to service/api tests.
- **Fit with codebase**
  - ETag calculation is scoped to `DocumentService.get_attachment_thumbnail` which already returns thumbnail metadata (app/services/document_service.py).
  - Conditional responses hook straight into `app/api/documents.py:get_attachment_thumbnail` / `get_part_cover_thumbnail`, matching existing blueprint routes.
  - Test updates align with `tests/test_document_service.py` and `tests/test_document_api.py`, the suites that currently cover thumbnail behavior.

### 3) Open Questions & Ambiguities
- How should non-image icon responses produce an ETag when Step 1 keeps returning `None` but Step 3 demands an `ETag` header even for inline SVG (docs/features/thumbnail_etag/plan.md:12,14)?
- Should the ETag be emitted as a strong tag (`"etag-value"`) or weak (`W/"…"`) and do we need quoting to stay RFC 7232 compliant (docs/features/thumbnail_etag/plan.md:13)?
- For attachments lacking `s3_key` (e.g., legacy data), what fallback hash or behavior should apply so the API can still compare `If-None-Match` (docs/features/thumbnail_etag/plan.md:12-13)?

### 4) Deterministic Backend Coverage (new/changed behavior only)
- `DocumentService.get_attachment_thumbnail` adds hash output (docs/features/thumbnail_etag/plan.md:12).
  - **Scenarios:** Step 4 covers image hash vs SVG omission (docs/features/thumbnail_etag/plan.md:8-9,14).
  - **Instrumentation:** None proposed; acceptable because no metrics yet exist for thumbnails.
  - **Persistence hooks:** Read-only S3 usage; no migration needed.
- `GET /api/parts/<part_key>/attachments/<id>/thumbnail` conditional caching (docs/features/thumbnail_etag/plan.md:13).
  - **Scenarios:** Step 4 promises 200-with-header and 304-empty-body tests (docs/features/thumbnail_etag/plan.md:8-9,14).
  - **Instrumentation:** None described; fine unless we need Prometheus metrics (not currently present).
  - **Persistence hooks:** No storage changes.
- `GET /api/parts/<part_key>/cover/thumbnail` mirrored behavior (docs/features/thumbnail_etag/plan.md:14).
  - **Scenarios:** **Major** — no plan for cover-specific 200/304 tests; `tests/test_document_api.py` today lacks cover thumbnail cases.
  - **Instrumentation:** None (acceptable).
  - **Persistence hooks:** No storage changes.

### 5) Adversarial Sweep (must find ≥3 credible issues or declare why none exist)
- **[A] Major — SVG ETag contradiction**
  **Evidence:** “return that value alongside … continue to return `None` for non-image icon responses” (docs/features/thumbnail_etag/plan.md:12) vs. “ensure the `ETag` header is included even when returning inline SVG content” (docs/features/thumbnail_etag/plan.md:14).  
  **Why it matters:** API would attempt a 304 compare with a missing hash, leading to inconsistent caching semantics or runtime `TypeError`.  
  **Fix suggestion:** Decide on a concrete SVG ETag strategy (e.g., hash icon content) and state it consistently for service + API.  
  **Confidence:** High.
- **[B] Major — Unquoted ETag header**
  **Evidence:** “respond with `("", 304, {"ETag": hash_value})` … add the same `ETag` header to the 200 response” (docs/features/thumbnail_etag/plan.md:13).  
  **Why it matters:** RFC 7232 requires quoted ETags; sending bare hex breaks conditional requests in standards-compliant clients/proxies.  
  **Fix suggestion:** Specify strong tags like `{"ETag": f'"{hash_value}"'}` (or weak form if intended).  
  **Confidence:** Medium (spec-driven but worth clarifying).
- **[C] Major — Missing cover thumbnail tests**
  **Evidence:** Step 4 limits API coverage to “assert the `ETag` header on 200 responses and confirm a 304 response…” without mentioning the cover endpoint (docs/features/thumbnail_etag/plan.md:8-9,14).  
  **Why it matters:** Cover thumbnail route will gain new branching yet stay untested, risking regressions (e.g., missing headers, wrong status).  
  **Fix suggestion:** Add explicit plan items for `get_part_cover_thumbnail` tests (success + 304).  
  **Confidence:** High.

### 6) Derived-Value & Persistence Invariants
| Derived value | Source dataset (filtered/unfiltered) | Write/cleanup it triggers | Guard conditions | Invariant that must hold | Evidence |
| ------------- | ------------------------------------ | ------------------------- | ---------------- | ------------------------ | -------- |
| `thumbnail_etag` string | `attachment.s3_key` (unfiltered) | HTTP `ETag` header for attachment thumbnails | Attachment is S3-backed image | Hash must exist and be stable per key | docs/features/thumbnail_etag/plan.md:12-13 |
| `cover_thumbnail_etag` | `cover_attachment.s3_key` via `get_part_cover_attachment` (unfiltered) | HTTP `ETag` header for cover thumbnail route | Cover attachment present | Header present even for inline responses per plan | docs/features/thumbnail_etag/plan.md:14 |
| `conditional_304_decision` | Request `If-None-Match` vs derived ETag (filtered by equality) | Short-circuit 304 response (skip file streaming) | Both values non-empty | Only trigger 304 when tags match exactly | docs/features/thumbnail_etag/plan.md:13 |

### 7) Risks & Mitigations (top 3)
- SVG fallback ETag ambiguity (Issue A) can break conditional caching; clarify hashing strategy in the plan.
- Lack of cover-thumbnail tests (Issue C) leaves new behavior unverified; expand Step 4 to cover that route.
- Unquoted ETag headers (Issue B) risk protocol incompatibility; document proper header formatting.

### 8) Confidence
Medium — familiar with Flask caching patterns, but open questions around SVG hashing and header formatting must be resolved before implementation.
