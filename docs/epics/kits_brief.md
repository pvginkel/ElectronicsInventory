# Kits (Component Collections) — Feature Brief

> **Goal:** A **Kit** is a named collection of existing **Parts** with a **Build target**. It computes shortages from on-hand inventory (taking other Kits into account when you want) and lets you create/append a **Shopping List** for ordering, or create a **Pick List** for stepwise stock deduction. Single-user; no docs/pricing/AI.

See `docs/epics/kits_feature_breakdown.md` for a breakdown of the work in this brief.

---

## 1) Scope & non-goals

* **In scope:** Define kit contents; see Required/Total/In stock/Reserved/Shortfall; create/append **Shopping Lists**; make persisted **Pick Lists**; archive/unarchive.
* **Out of scope:** Project management, attachments, variants/templates/clones, pricing/exports/AI, global search.

---

## 2) Terminology (no ambiguity)

* **Kit** — the entity (was “Project”).
* **Kit contents** — the BOM grid: **Part | Required (per unit) | Note**.
* **Shopping List** — for ordering; has its own states.
* **Pick List** — persisted picking checklist tied to a Kit; saving deducts stock from **Locations**.

---

## 3) Entities & fields

### Kit

* `name` (req), `description` (opt), `build_target` (int ≥1), `status` = **Active | Archived**.
* Links: **many Shopping Lists** (no limit), **many Pick Lists** (no limit).
* **Archived = read-only** (no edits, no new Shopping/Pick Lists). Unarchive returns to editable.

### KitContent (BOM line)

* `kit_id`, `part_id` (existing Part only), `required_per_unit` (int ≥1), `note` (opt).
* **No duplicate `part_id`** in a single kit.

### PickList

* `kit_id`, `requested_units` (int ≥1), `completed` (bool), timestamps.
* **PickListLine** = allocation entry for a **Part × Location** that contributes stock toward the request.
* Lines are generated automatically by the allocator (no manual creation or edits).
* Allocation order: locations sorted by **lowest on-hand quantity**, breaking ties by **Box number → Location number**.
* Each line stores the immutable **quantity_to_pick** that will be deducted once picked.

---

## 4) Computations (per Kit content row)

Let **Required** = per-unit qty; **BuildTarget** = this kit’s target.

* **Total** = `Required × BuildTarget` *(this kit only)*
* **In stock** = current on-hand across all locations
* **Reserved** = Σ(`Required × BuildTarget`) across **all other Active kits** that include this part

  * **Exclude** archived kits
  * **Ignore** Pick Lists entirely (only build targets count)
* **Shortfall** = `max(0, Total − (In stock − Reserved))`

**Grid columns:** **Part | Required | Total | In stock | Reserved | Shortfall | Note**
No “coverage states”; **Shortfall** is the signal.

---

## 5) Create / append a **Shopping List** from a Kit

**Dialog**

* **Order for N units** (default **Build target**; int ≥1).
* **Honor reserved** (default **OFF**).

  * **ON:** `available = In stock − Reserved`
  * **OFF:** `available = In stock`
* For each line: **NeededForList** = `max(0, (Required × N) − available)`.

**Targets**

* **Create new** Concept list **or** **append to** an existing **Concept** list.
* When appending and the part already exists on that Shopping List: **increase the quantity** (merge).
* **Note carry-over:** append `"[From Kit <name>]: <BOM note>"` on a new line to the list line’s note (if present).

**Chips & version**

* Lists show **“Created from Kit ‹name›”** chip (multiple kits can link to the same list).
* Kits show chips for all linked **Shopping Lists**.
* Snapshot `kit.updated_at` when creating/appending; if the kit changes later, show a **warning triangle** on the chip.
* **Unlink** action: trash icon on chip (hover) → confirm → detaches link (no data changes).

**Behavioral note**

* You **can** create multiple Shopping Lists from the same Kit (even with identical settings). The app does **not** prevent double-ordering.

---

## 6) **Pick List** (persisted, allocator-driven picking)

**Create**

* “Create Pick List” → enter **Requested units (Q)** (int ≥1); persisted on the pick list.
* For each Kit part, compute **required_total = required_per_unit × Q**.
* Allocate stock by iterating the part’s locations in ascending **on-hand quantity**, then **Box → Location**.
  * For each location, create a line with `quantity_to_pick = min(remaining_required, location_on_hand)`.
  * Decrease the remaining requirement and continue until the requirement is satisfied or locations are exhausted.
* If the allocator runs out of locations before fulfilling the part’s requirement, **abort creation** with a validation error (pick list is not created).
* Persist only the generated lines; there is no option to add, remove, or edit allocations manually.

**Execution**

* Pick list detail shows read-only rows (part, location, quantity to pick); no quantity/location inputs.
* Every line has a single **“Picked”** button. Clicking it:
  * Marks the line as completed and deducts `quantity_to_pick` from the assigned location (same inventory mutation path as Part screen).
  * Drops the location from the part if the new on-hand hits zero (standard behavior).
* Completed lines display an **“Undo”** button. Undo restores the previously deducted quantity and returns the line to the open state.
* Once the final line is marked picked (all lines completed), the pick list automatically transitions to **Completed**. Completed pick lists are shown in the UI as archived.
* The **“Undo”** buttons stay available and the user. Undo restores the previously deducted quantity, returns the line to the open state, and returns the list to the open state.

---

## 7) UI spec (modeled on **Shopping List** UI)

**Kits Overview**

* Tabs: **Active / Archived**.
* Search box.
* Cards: name, description, last updated, badges:

  * Has open **Shopping List(s)** (not Done)
  * Has open **Pick List(s)** (not Completed)
* Actions: **New Kit**, **Archive / Unarchive**.

**Kit Detail**

* Header: Name, Description, **Build target** (editable while Active).
* **Kit contents** grid (see columns above); add/remove/edit rows; prevent duplicate parts.
* Actions: **Create/Append Shopping List** (dialog), **Create Pick List**.
* **Chips area:**

  * Linked **Shopping Lists** with state (Concept/Ready/Ordered/Received/Done) + version triangle when stale + unlink trash.
  * Linked **Pick Lists** with Completed/Not completed.

**Part detail**

* Add a **“Used in Kits”** icon (sibling to the Shopping Cart icon). Hover shows non-archived kits using the part; click to navigate.

**Search behavior**

* **Overview:** filters by Kit name/description.
* **Kit detail:** filters **Kit content** rows by part name/SKU and the line note.

---

## 8) Validation & rules

* Integers only (≥1): **Required**, **Build target**, **Order for N**, **Pick quantities**.
* No duplicate parts in a Kit.
* Append **only** to **Concept** Shopping Lists.
* Archived Kits are **read-only**; you can **unarchive** to edit or create lists/picks.
* **Reserved** excludes archived kits; **ignores** any Pick Lists.
* **Location zero rule:** when a Part’s total stock hits **0**, its location entries are removed (system invariant).

---

## 9) Limits & performance

* Design for ≤ **20 Kits**, each ≤ **50** contents lines.
* No pagination; dynamic computations done server-side per kit detail.

---

## 10) API sketch (illustrative)

* `POST /kits` → {name, description?, build_target}
* `GET /kits?status=active|archived&query=`
* `GET /kits/{id}` → kit + contents + computed per-line fields (In stock, Reserved, Total, Shortfall)
* `POST /kits/{id}/contents` (add line) / `PATCH /kits/{id}/contents/{lineId}` / `DELETE ...`
* `POST /kits/{id}:create-shopping-list` → {units, honorReserved, listId?} → returns list meta + chip snapshot
* `POST /kits/{id}/pick-lists` → {requested_units}
* `PATCH /pick-lists/{id}` (save deductions)
* `POST /pick-lists/{id}:complete` → {decrease_build_target: bool}
* `POST /kits/{id}:archive` | `POST /kits/{id}:unarchive`
* `POST /shopping-lists/{listId}:unlink-kit`

---

## 11) QA & test notes

* **Reserved math:** sums other **Active** kits’ `(required_per_unit × build_target)`; excludes **Archived**; ignores Pick Lists.
* **Honor reserved toggle:** ON vs OFF yields different `NeededForList`.
* **Append merge:** increases qty on existing Shopping List lines; note appended with `"[From Kit <name>]:"`.
* **Pick List save:** deducts **only checked** lines; disables them; multiple saves OK.
* **Pick validation:** over-location = blocking; over-plan = warning.
* **Complete:** decreases build target by **Q**, clamp to 0.
* **Delete Pick List:** only when nothing deducted.
* **Version chip:** show warning triangle if `list.snapshot_kit_updated_at < kit.updated_at`.
* **Unlink chip:** trash → confirm → detaches link only.
* **Invariant test (Python):** when a Part’s total becomes **0**, **all location records are removed**.
