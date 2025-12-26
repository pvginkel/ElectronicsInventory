# Pick List PDF Report — Technical Plan

## 0) Research Log & Findings

**Researched Areas:**
- Existing pick list models (`KitPickList`, `KitPickListLine`) and their relationships
- Pick list API patterns in `app/api/pick_lists.py`
- Pick list service (`KitPickListService`) and data retrieval methods
- Location/Box models to understand box_no and loc_no access patterns
- Service container and dependency injection patterns
- Binary content delivery patterns (found `send_file` usage in CAS and documents APIs)
- PDF generation capabilities in the codebase (none found; ReportLab not currently in dependencies)
- Test data patterns and API test structure

**Key Findings:**
1. Pick list data is already fully structured with eager-loaded relationships via `get_pick_list_detail()`
2. Location data includes `box_no` and `loc_no` directly on the `Location` model (no joins needed)
3. Lines are currently sorted by part key, box_no, loc_no in service (we'll need box-first grouping for PDF)
4. Flask's `send_file` with `BytesIO` is the established pattern for binary responses
5. ReportLab is not in `pyproject.toml`; needs to be added as a dependency
6. Service layer follows strict patterns: `BaseService` inheritance, DB session injection, typed exceptions
7. API layer is thin: validation via Pydantic schemas, error handling via `@handle_api_errors`

**Special Considerations:**
- This is a read-only feature (no database mutations), so no transaction complexity
- PDF generation should happen in a dedicated service to keep pick list service focused
- The brief specifies ReportLab; confirmed it's pure Python (no system dependencies)
- Need to group lines by box for efficient picking order (not currently done in service)

**Conflicts & Resolutions:**
- None identified; feature is additive with clear boundaries

---

## 1) Intent & Scope

**User intent**

Add a printable PDF export for pick lists that serves as both a picking guide (organized by location for efficient warehouse walking) and a consumption tracker (with checkboxes and space for handwritten notes).

**Prompt quotes**

"PDF serves a dual purpose: 1. **Picking Guide** - A printed sheet to carry while picking items from storage, organized by location for an efficient walking route 2. **Consumption Tracker** - A paper record to mark off items as they are consumed during assembly, with space to note quantity deviations"

"Lines grouped by box number (for efficient picking - visit each box once)"

"Within each box, lines sorted by location number"

"Returns PDF as inline content (viewable in browser)"

"Use ReportLab for PDF generation (pure Python, no system dependencies)"

**In scope**

- New `GET /pick-lists/<pick_list_id>/pdf` API endpoint returning inline PDF
- New `PickListReportService` for PDF generation with ReportLab
- PDF layout with header (kit name, pick list ID, date, status, units to build)
- Lines grouped by box number, sorted by location within each box
- Table columns: Location, Part ID, Description, Expected (quantity_to_pick), Actual (blank), Used (checkbox)
- Content-Disposition header with inline disposition and filename
- Add ReportLab dependency to `pyproject.toml`
- Comprehensive tests for service (PDF structure validation) and API (response format, headers, status codes)

**Out of scope**

- Recording deviations back to the database (paper-only workflow)
- Multiple pick list export or batch PDF generation
- Customizable layouts, templates, or user preferences
- Pagination or handling extremely large pick lists (assume reasonable line counts)
- Internationalization or locale-specific formatting

**Assumptions / constraints**

- Pick lists retrieved via `KitPickListService.get_pick_list_detail()` provide complete data (kit, lines, locations, parts)
- Line counts are reasonable (assume <1000 lines; ReportLab can handle but won't optimize for extreme cases)
- PDF is generated on-demand (no caching or pre-generation)
- Browser clients can display inline PDFs (standard capability)
- No authentication/authorization required (matches existing pick list API pattern)
- Filename format: `pick_list_<id>.pdf`

---

## 2) Affected Areas & File Map

**New files to create:**

- Area: `app/services/pick_list_report_service.py`
- Why: Encapsulates PDF generation logic using ReportLab; keeps pick list service focused on data workflows
- Evidence: Service layer pattern from `CLAUDE.md:52-72` — services inherit `BaseService` when DB is needed; this service only reads data (no DB session required), so plain class with `MetricsService` injected via constructor: `def __init__(self, metrics_service: MetricsServiceProtocol)`

- Area: `tests/services/test_pick_list_report_service.py`
- Why: Service tests for PDF generation scenarios (minimal data, full data, grouping/sorting logic)
- Evidence: Testing requirements from `CLAUDE.md:119-154` — all public service methods require comprehensive test coverage

- Area: `tests/api/test_pick_lists_api.py` (extend existing)
- Why: API tests for new `/pick-lists/<id>/pdf` endpoint (response format, headers, status codes, error cases)
- Evidence: Existing API test patterns at `/work/backend/tests/api/test_pick_lists_api.py:57-100`

**Files to modify:**

- Area: `app/api/pick_lists.py`
- Why: Add new `GET /pick-lists/<pick_list_id>/pdf` endpoint
- Evidence: Existing pick list endpoints at `/work/backend/app/api/pick_lists.py:76-91` (get detail), `76-109` (delete)

- Area: `app/services/container.py`
- Why: Register `PickListReportService` provider for dependency injection
- Evidence: Service container pattern at `/work/backend/app/services/container.py:41-100` — Factory providers for stateless services. Register as: `pick_list_report_service = providers.Factory(PickListReportService, metrics_service=metrics_service)`

- Area: `app/__init__.py`
- Why: Wire `app.api.pick_lists` module to container (already wired, but verify)
- Evidence: Container wiring at `/work/backend/app/__init__.py` (need to check full file for wiring list)

- Area: `pyproject.toml`
- Why: Add `reportlab` dependency
- Evidence: Dependency list at `/work/backend/pyproject.toml:13-35`

---

## 3) Data Model / Contracts

**No database schema changes.** This feature is read-only and uses existing models.

- Entity / contract: PDF binary response
- Shape: `BytesIO` buffer (PDF document in memory); service method signature: `def generate_pdf(self, pick_list: KitPickList) -> BytesIO`
- Refactor strategy: No back-compat concerns; new endpoint returning binary content. Service returns `BytesIO` (seeked to 0); API passes it directly to `send_file()` without calling `.read()` or `.getvalue()`
- Evidence: Binary response patterns at `/work/backend/app/api/cas.py:78-111` (send_file with BytesIO and Content-Disposition)

- Entity / contract: PDF Content Metadata (HTTP headers)
- Shape:
  ```
  Content-Type: application/pdf
  Content-Disposition: inline; filename="pick_list_<id>.pdf"
  Cache-Control: no-cache (PDF is generated on-demand and may change)
  ```
- Refactor strategy: New headers; no existing contract to refactor
- Evidence: Content-Disposition patterns at `/work/backend/app/api/cas.py:104-111`, `/work/backend/app/api/testing.py:189-246`

- Entity / contract: PDF document structure (internal to service)
- Shape:
  ```
  Header:
    - Kit name (from pick_list.kit_name)
    - Pick List ID (pick_list.id)
    - Created Date (pick_list.created_at formatted as YYYY-MM-DD)
    - Status (pick_list.status)
    - Units to Build (pick_list.requested_units)

  Per-Box Section:
    - Box header: "Box <box_no>"
    - Table with columns:
      | Location | Part ID | Description | Expected | Actual | Used |
      | 7-3      | ABCD    | NE555 timer | 4        | ___    | [ ] |

  Lines sorted: by box_no ascending, then loc_no ascending within each box
  ```
- Refactor strategy: Service encapsulates all layout logic; no external contract
- Evidence: Pick list detail structure at `/work/backend/app/models/kit_pick_list.py:78-134` (properties: kit_name, lines, requested_units, status, etc.)

---

## 4) API / Integration Surface

- Surface: `GET /pick-lists/<pick_list_id>/pdf`
- Inputs:
  - `pick_list_id` (int, path parameter): identifier of the pick list to export
- Outputs:
  - Success (200): Binary PDF content with headers `Content-Type: application/pdf`, `Content-Disposition: inline; filename="pick_list_<id>.pdf"`
  - Not Found (404): Standard error response if pick list does not exist (same as get detail endpoint)
- Errors:
  - 404: Pick list not found (via `RecordNotFoundException` from service)
  - 500: PDF generation failure (unexpected; ReportLab errors surface as generic server error)
- Evidence: Existing pick list detail endpoint at `/work/backend/app/api/pick_lists.py:76-91` for pattern; binary response pattern at `/work/backend/app/api/cas.py:78-111`

---

## 5) Algorithms & State Machines

- Flow: PDF generation
- Steps:
  1. Fetch pick list detail via `KitPickListService.get_pick_list_detail(pick_list_id)` (raises `RecordNotFoundException` if missing)
  2. Group lines by `line.location.box_no` (iterate and build dict[int, list[KitPickListLine]])
  3. Sort box numbers ascending
  4. For each box group, sort lines by `line.location.loc_no` ascending
  5. Create ReportLab canvas/document in memory (BytesIO buffer)
  6. Draw PDF header section (kit name, pick list ID, formatted date, status, requested units)
  7. For each box group in sorted order:
     a. Draw box header ("Box <box_no>")
     b. Draw table with columns: Location, Part ID, Description, Expected, Actual, Used
     c. For each line in box group (sorted by loc_no):
        - Location: `f"{line.location.box_no}-{line.location.loc_no}"`
        - Part ID: `line.kit_content.part_key`
        - Description: `line.kit_content.part_description` (truncate if too long, e.g., max 50 chars)
        - Expected: `line.quantity_to_pick`
        - Actual: blank cell (for handwriting)
        - Used: checkbox glyph or `[ ]` text
  8. Finalize PDF, seek BytesIO buffer to position 0, and return the buffer
- States / transitions: None (stateless operation)
- Hotspots:
  - ReportLab rendering time (expected O(n) in line count; should be fast for typical pick lists <100 lines)
  - Memory usage (entire PDF in memory; acceptable for document sizes <10MB expected)
  - Grouping/sorting logic (O(n log n) for sorting; negligible overhead)
- Evidence: Pick list detail method at `/work/backend/app/services/kit_pick_list_service.py:175-204`; line structure at `/work/backend/app/models/kit_pick_list_line.py:36-132`

---

## 6) Derived State & Invariants

**None.** This is a read-only export feature with no persistent side effects.

Justification: PDF generation reads immutable pick list data and produces an ephemeral document. No writes, cleanup, or cross-context state dependencies. The only derived values (box groupings, sorted lines) exist transiently in memory during PDF generation and are not persisted or used to drive mutations elsewhere.

---

## 7) Consistency, Transactions & Concurrency

- Transaction scope: Read-only; `KitPickListService.get_pick_list_detail()` reads within its own transaction scope (service already handles this)
- Atomic requirements: None (no writes)
- Retry / idempotency: Idempotent by nature (GET request; same input always produces equivalent PDF)
- Ordering / concurrency controls: No locking required; reads snapshot of pick list at request time
- Evidence: BaseService pattern at `/work/backend/app/services/base.py` (DB session management); GET endpoint pattern at `/work/backend/app/api/pick_lists.py:76-91` (no transaction handling in API layer)

---

## 8) Errors & Edge Cases

- Failure: Pick list does not exist
- Surface: API endpoint
- Handling: 404 response via `@handle_api_errors` decorator; `RecordNotFoundException` raised by `KitPickListService.get_pick_list_detail()`
- Guardrails: Service validates existence; API tests verify 404 response
- Evidence: Existing error handling at `/work/backend/app/services/kit_pick_list_service.py:191-192`; error decorator at `/work/backend/app/api/pick_lists.py:83-84`

- Failure: Pick list has zero lines (empty pick list)
- Surface: PDF generation service
- Handling: Generate valid PDF with header and "No lines to pick" message or empty table
- Guardrails: Service test for zero-line scenario
- Evidence: Pick list can theoretically have zero lines (no constraint prevents it)

- Failure: Part description is extremely long
- Surface: PDF rendering
- Handling: Truncate description to fit column width (e.g., max 50 characters with ellipsis)
- Guardrails: Service implementation handles truncation; test with long description
- Evidence: Part description is free text with no length constraint at `/work/backend/app/models/part.py`

- Failure: Pick list has many lines (e.g., >500)
- Surface: PDF generation performance
- Handling: ReportLab will render but may take a few seconds; acceptable for on-demand generation
- Guardrails: No explicit limit; assume reasonable use (if performance becomes issue, can add pagination or async generation in future)
- Evidence: No line count constraint at pick list creation

- Failure: ReportLab throws unexpected exception during rendering
- Surface: API endpoint
- Handling: 500 response via `@handle_api_errors`; exception logged by Flask
- Guardrails: Let error surface to user; ReportLab is stable library with low error rate
- Evidence: Error handling philosophy at `/work/backend/CLAUDE.md:204-210` — fail fast, surface errors

---

## 9) Observability / Telemetry

- Signal: `pick_list_pdf_generated`
- Type: Counter with labels
- Trigger: At end of successful PDF generation in `PickListReportService.generate_pdf()`
- Labels / fields: `pick_list_id`, `line_count`, `box_count`
- Consumer: Prometheus metrics endpoint; tracks usage and complexity of generated PDFs
- Evidence: MetricsService pattern at `/work/backend/app/services/metrics_service.py`; counter increment examples in `KitPickListService.pick_line()` at line 330

- Signal: `pick_list_pdf_generation_duration_seconds`
- Type: Histogram
- Trigger: Record elapsed time (using `time.perf_counter()`) for PDF generation
- Labels / fields: `status` (success/error)
- Consumer: Performance monitoring; identify slow PDF renders
- Evidence: Time measurement pattern at `/work/backend/CLAUDE.md:187-202` — use `perf_counter()` for durations; existing duration metrics in `kit_pick_list_service.py:338-343`

---

## 10) Background Work & Shutdown

**None.** PDF generation is synchronous, request-scoped work. No background threads, workers, or shutdown hooks required.

Justification: PDFs are generated on-demand within the HTTP request/response cycle. Service is stateless with no lifecycle beyond individual method calls.

---

## 11) Security & Permissions

Not applicable. No authentication or authorization required; follows existing pick list API pattern (unauthenticated single-user app per product brief).

---

## 12) UX / UI Impact

Not applicable. This is a backend-only feature providing a new API endpoint. Frontend integration (e.g., "Download PDF" button) is out of scope for this plan.

---

## 13) Deterministic Test Plan

- Surface: `PickListReportService.generate_pdf()`
- Scenarios:
  - Given a pick list with one line, When generating PDF, Then PDF contains header and single-row table with correct data
  - Given a pick list with lines from multiple boxes, When generating PDF, Then lines are grouped by box and sorted by box_no, then loc_no
  - Given a pick list with zero lines, When generating PDF, Then PDF contains header and empty table or "no lines" message
  - Given a pick list with a part having very long description (>100 chars), When generating PDF, Then description is truncated to fit column
  - Given multiple lines in same box with different loc_no, When generating PDF, Then lines appear sorted by loc_no ascending
- Fixtures / hooks: Factory to create `KitPickList` with controlled line data; no DI needed (service doesn't require DB session)
- Gaps: None; all core scenarios covered
- Evidence: Existing service test pattern at `/work/backend/tests/services/test_kit_pick_list_service.py`

- Surface: `GET /pick-lists/<pick_list_id>/pdf` API endpoint
- Scenarios:
  - Given a valid pick list, When requesting PDF, Then response is 200 with application/pdf content type and inline Content-Disposition
  - Given a valid pick list, When requesting PDF, Then filename in Content-Disposition matches "pick_list_<id>.pdf"
  - Given a non-existent pick list ID, When requesting PDF, Then response is 404 with error JSON
  - Given a valid pick list, When requesting PDF, Then response body is valid PDF (can verify by checking PDF header bytes `%PDF-`)
- Fixtures / hooks: Extend `_seed_kit_with_inventory` helper or create new `_seed_multi_box_pick_list()` helper to support multi-box scenarios for grouping tests; Flask test client
- Gaps: Not testing actual PDF rendering quality (visual verification); trust ReportLab correctness
- Evidence: Existing API test patterns at `/work/backend/tests/api/test_pick_lists_api.py:60-100`

---

## 14) Implementation Slices

Not needed. Feature is small enough to implement in a single slice (add dependency → create service → add API endpoint → write tests).

---

## 15) Risks & Open Questions

**Risks:**

- Risk: ReportLab dependency size or compatibility issues
- Impact: Low; ReportLab is mature, pure-Python, widely used
- Mitigation: Add dependency and verify in dev environment before coding; no known compatibility issues with Python 3.11+

- Risk: PDF generation performance for large pick lists
- Impact: Low-medium; users may experience slow responses for pick lists with >500 lines
- Mitigation: Accept for MVP (brief explicitly omits pagination/optimization); can add async generation or caching later if needed

- Risk: PDF layout issues on different paper sizes or printers
- Impact: Low; users may need to adjust print settings
- Mitigation: Use standard Letter/A4-compatible layout with ReportLab defaults; document any known quirks in API docs

**Open Questions:**

None. All design decisions are clear from the brief and codebase research.

---

## 16) Confidence

Confidence: High — Feature is well-scoped, additive, read-only, and follows established codebase patterns. ReportLab is a proven library. No complex state management or integration points. Clear requirements from brief.
