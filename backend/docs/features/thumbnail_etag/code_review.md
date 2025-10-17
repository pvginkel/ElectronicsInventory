**Thumbnail ETag Review**

### 1) Summary & Decision
The change adds ETag calculation in `DocumentService` and wires conditional GET handling into both attachment and cover thumbnail endpoints while extending service/API tests for the new metadata. However, conditional requests still trigger thumbnail generation even when the hash already matches, so clients cannot rely on `If-None-Match` to avoid S3/disk work. **Decision:** GO-WITH-CONDITIONS — fix the conditional short-circuit so matching ETags skip thumbnail generation.

### 2) Conformance to Plan (with evidence)
- The service now returns `(thumbnail_path, content_type, etag)` derived from the S3 key or SVG icon as planned (`docs/features/thumbnail_etag/plan.md:5-14`; `app/services/document_service.py:459-490` `"etag = hashlib.sha256(...)"`).
- API endpoints unwrap the new tuple, compare against `If-None-Match`, and attach the `ETag` header on both 200 and 304 responses (`docs/features/thumbnail_etag/plan.md:6-14`; `app/api/documents.py:103-117`, `app/api/documents.py:215-229`).
- Tests cover service hashing and API responses (`docs/features/thumbnail_etag/plan.md:12-14`; `tests/test_document_service.py:482-826`, `tests/test_document_api.py:383-574`).
- Note: the plan’s bullet about “omitting” hashes for SVG fallbacks (`docs/features/thumbnail_etag/plan.md:8`) conflicts with the later steps; the implementation follows the step-by-step guidance (hash SVG bytes), which is reasonable.

### 3) Correctness — Findings (ranked)
- **[C1] Major — Conditional GET still forces thumbnail generation**  
  **Evidence:** `app/api/documents.py:103-117` immediately calls `get_attachment_thumbnail(...)` to fetch the path before checking the header; inside, `app/services/document_service.py:475-480` invokes `self.image_service.get_thumbnail_path(...)`, which will hit S3/generate the file when the cached JPEG is absent.  
  **Why it matters:** If a new pod (or a pod after thumbnail cleanup) receives a request with a valid `If-None-Match`, we still attempt to regenerate the thumbnail. Any transient S3 failure now returns an error instead of the expected 304, defeating the resilience benefit the feature promised.  
  **Fix suggestion:** Split the flow so we compute the hash before generating files. For example, add a lightweight `DocumentService.get_attachment_etag` (or let `get_attachment_thumbnail` accept an `if_none_match` value) to compare hashes prior to calling `get_thumbnail_path`, and only generate/stream the file when the ETag mismatches. Extend the API test by patching `ImageService.get_thumbnail_path` to raise `InvalidOperationException` while sending a matching `If-None-Match`—the fixed code should return 304 instead of bubbling the exception.  
  **Confidence:** High.

### 4) Over-Engineering & Refactoring Opportunities
- Once the above fix is applied, consider keeping the ETag calculation in a small helper so both the pre-check and the file-streaming path reuse the same hashing logic. That keeps the service method tidy and makes future metrics hooks easier.

### 5) Style & Consistency
- The API logic mirrors the existing cover/attachment symmetry and keeps HTTP concerns in the blueprint layer. Strong ETags are consistently quoted, matching our API conventions.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- `tests/test_document_service.py:482-826` exercise hashing for PDF icons, direct images, and URL fallbacks, ensuring deterministic hashes by checking exact SHA-256 outputs.
- `tests/test_document_api.py:383-574` covers both 200 responses (verifying `ETag` headers) and the 304 short-circuit for attachment and cover routes. Add a negative test once C1 is fixed to assert we still return 304 when thumbnail regeneration fails.

### 7) Adversarial Sweep
- Triggered the failure in **C1** by reasoning about a pod without a cached JPEG and an `ImageService.get_thumbnail_path` failure path; the current control flow confirms the bug (see Section 3).  
- Checked fallback SVG scenarios: service hashing uses the raw icon bytes (`app/services/document_service.py:482-490`) and the tests at `tests/test_document_service.py:784-803` show the hash is stable—no issue.  
- Confirmed varying thumbnail sizes stay consistent: the hash is tied to the S3 key, and query parameters scope caches per representation, so identical sizes receive the expected ETag without cross-talk.

### 8) Invariants Checklist
| Invariant | Where enforced | How it could fail | Current protection | Evidence (file:lines) |
|---|---|---|---|---|
| S3-backed thumbnails use deterministic hash of the object key | Service layer | Hash logic regresses | Direct SHA-256 on `attachment.s3_key` | app/services/document_service.py:475-480 |
| SVG fallback responses always include matching ETag header | API layer | Header omitted during inline return | Inline branch adds `ETag` next to `Content-Type` | app/api/documents.py:110-113 |
| 304 responses remain header-complete with empty bodies | API layer/tests | Regression strips `ETag` or body non-empty | Tests assert status, header, and body | tests/test_document_api.py:416-447, tests/test_document_api.py:541-574 |

### 9) Questions / Needs-Info
- None; the remaining issue is purely implementation-side.

### 10) Risks & Mitigations (top 3)
- R1 — Conditional requests still depend on thumbnail generation (C1) → Mitigation: compute/hash metadata before touching `ImageService`.  
- R2 — `If-None-Match` parsing only supports a single quoted tag → Mitigation: when addressing C1, consider normalizing the header into tokens so proxies sending multiple tags still benefit.  
- R3 — Error handling path for regen failures lacks targeted tests → Mitigation: add the proposed negative test to lock behaviour once C1 is resolved.

### 11) Confidence
Medium — The flow is straightforward and well-tested, but the uncovered regression (C1) means I want to see the fix plus a guarding test before giving a full GO.
