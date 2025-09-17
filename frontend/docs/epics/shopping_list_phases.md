This document describes the development phases for the Shopping List feature described in @docs/epics/shopping_list_brief.md.

# Phase 0 — Seller registry (enabler)

**Backend**

* Add Seller management: create/edit/delete Seller with **Name (required)** and **Website (required)**.
* Update Part to **reference a Seller** (keep existing product URL on Part as-is).
* Provide operation to **list Sellers** for dropdowns.

**Front-end**

* Seller admin UI: list, create, edit, delete.
* Update Part UI to **use Seller reference** (dropdown) instead of free-text seller.
* Show Seller name and product URL consistently on Part detail.

---

# Phase 1 — Shopping List foundations (Concept lists)

**Backend**

* Shopping List entity: **name**, optional **description**, **status = Concept** by default, archive flag.
* Shopping List Line: **Part (required)**, **Seller override (optional)**, **Needed (int ≥ 1)**, **Ordered (int, default 0)**, **Received (int, default 0)**, **Note (optional)**, **Line Status = New**.
* **Duplicate prevention**: on a given list, a Part may appear **only once** (reject additional inserts for same Part).
* Basic operations: create/rename/describe/delete list; add/edit/delete line; list lines.
* Guardrails: cannot change **Line Status** to Ordered/Done here; cannot **receive** stock here.

**Front-end**

* Lists Overview (initial): create new list; open list; delete list (confirm).
* **Concept view**: editable grid with columns
  Part | Seller | Needed | Ordered (ro) | Received (ro) | Note | Actions

  * Add row: Part picker (existing parts only), Needed, optional Seller override, Note.
  * **Prevent duplicates**: if user tries to add same Part again, show error directing them to edit the existing line.
  * Sorting (Part description, Part/MPN, Category, Date added).
  * Delete line (confirm).
* Footer action: **Mark “Ready for Ordering”** (enabled when the list has ≥1 line).

---

# Phase 2 — “Ready for Ordering” view (seller-centric planning)

**Backend**

* List **status transition**: Concept → Ready for Ordering (and back **only if no line is Ordered**).
* Line **status transitions**: allow **New → Ordered** and back to **New**.
* Per-seller **Order Note** storage at list+seller grouping level.
* Operations to set **Ordered** quantity and mark line/group **Ordered**.

**Front-end**

* Ordering view (grouped by Seller):

  * Seller group header showing Seller name and **Order Note** (editable).
  * Lines show: Part | Needed | **Ordered (editable)** | Received | Note | **Status chip** | **Update Stock** (hidden until Ordered).
  * **Mark as Ordered (line):** prompts to confirm/set **Ordered** (prefill = Needed).
  * **Mark group as Ordered:** prompts to set Ordered for each line (prefill = Needed).
* Toolbar: **Back to Concept** available only when **no lines are Ordered**.
* Changing Seller override re-groups the line immediately.

---

# Phase 3 — Part-centric entry points & indicators

**Backend**

* Operation to **list Shopping Lists containing a given Part** where the line is **not Done**.
* Operation to **add a Part to a specific Concept list** with Needed/Note/Seller override.

**Front-end**

* **Part detail**:

  * Button **“Add to shopping list”** → choose existing **Concept** list or create new; set Needed, optional Note, Seller override.
  * **Badges** listing the active lists that include this Part (click to open list).
* **Part tile/icon**: if Part appears on any **not-Done** lines, show an icon; hover shows the list names (links).

---

# Phase 4 — Receive & update stock (line by line)

**Backend**

* Guard: **Update Stock** only allowed when **Line Status = Ordered**.
* Receive operation:

  * Input **Receive now (int ≥ 1)**; update the line’s **Received total** (cumulative).
  * Update the Part’s **stock** by allocating to existing locations and/or adding a new location.
  * Persist a **stock movement record** (timestamped) for history.
* Line can be **Marked Done** independently of numeric balance (with a mismatch reason/flag).
* Prevent changing the **Part** on a line after it is **Done**.

**Front-end**

* **Update Stock modal** (from an Ordered line):

  * Shows Part, Seller, current Ordered/Received totals.
  * Input **Receive now**; **allocate to locations** (increase existing or add new).
  * Actions: **Save**, **Save & next**, **Mark Done**.
  * If marking Done while Received ≠ Ordered: show a **confirmation**.
* After save, the line’s Received and the Part’s stock/locations reflect the change; lines visibly update.
* **Update Stock** CTAs are hidden for non-Ordered lines.

---

# Phase 5 — Lists Overview v2 (archive & counters)

**Backend**

* Archive/unarchive list. Deleting a list requires confirmation.
* Aggregate counts per list: number of lines by **status** (New/Ordered/Done) and last-updated timestamp.

**Front-end**

* Lists Overview upgrade:

  * Sections: **Active** (Concept/Ready), **Archived**.
  * Card shows: name, description, line counts per status, last updated.
  * Actions: **Archive/Unarchive**, **Delete** (confirm).
* In-list filter toggle: **Hide Done** (default on).

---

# Phase 6 — “Add project to list” wizard (bridge—project comes later)

**Backend**

* Shortage computation service: given a set of **(Part, Quantity needed)** pairs, return
  **Part | Quantity needed | Quantity in stock | Suggested “Quantity to order” = max(needed − stock, 0)**.
* Validation against target **Concept** list: detect any **duplicates** (Parts already on the list) and return a **conflict set**.

**Front-end**

* Wizard flow (menu: “Add project to list”):

  1. Pick target **Concept** list (or create new).
  2. Provide the **parts and needed quantities** (for now via a simple multi-select + quantities table; no paste/import).
  3. Review table: *Part | Needed | In stock | Quantity to order* (editable). Rows with 0 are **excluded** unless edited > 0.
  4. **Confirm & add**:

     * If **no conflicts**: add rows to the list.
     * If **conflicts** (part already on the list): show a conflict dialog listing those parts and explain that duplicates are not allowed; user can cancel and edit the existing list line(s), then re-run the wizard (no auto-merge).

---

# Phase 7 — Polishing & quality gates

**Backend**

* Enforce all **guards** consistently (status-based permissions; duplicate prevention).
* Provide lightweight **activity timestamps** for lists and lines to drive “last updated”.

**Front-end**

* Sorting refinements in both views; consistent **confirmations** for destructive actions.
* Visual polish: clear **status chips**, **seller chips**, hover help on counts, and stable column widths.
* Performance checks on large lists (virtualize long tables if needed later; not mandatory now).

---

## Final acceptance (end-to-end)

* Create list (Concept) → add parts (no duplicates) → mark Ready for Ordering → set Ordered per seller/line → **Update Stock** in partial shipments → **Mark Done** when reconciled → list visible in Overview with correct counters → **Archive** when finished.
* From Part detail: add to Concept list; see active list badges; see tile/icon indicators.
* From “Add project to list”: compute shortages, adjust “to order,” respect duplicate prevention, and add to the Concept list.