# 1) Purpose & guiding principles

* **Purpose:** Plan purchases for existing parts, then receive them into stock—fast, clear, error-resistant.
* **Keep it simple:** No prices, no exports, no complex filters. Named lists, minimal fields, tight flows.
* **Parts-first:** Every line references an **existing Part** (the brief allows non-existing, but this feature intentionally restricts to existing). Parts already carry a default seller.
* **Projects later:** Provide a clean entry point to build a list *from* a project definition (project feature will come after).

# 2) Key concepts & states

## 2.1 Entities (plain language)

* **Shopping List**: Named, with a **List Status** controlling the UI:

  * **Concept** – “editable grid” for composing the list.
  * **Ready for Ordering** – ordering-optimized view (group by Seller, per-group actions).
  * (Optional) **Archived** – whole list is tucked away once *you* decide; lists are kept by default.
* **Shopping List Line** (always tied to an existing Part):

  * **Part** (required; changeable until the line is **Done**).
  * **Seller override** (optional; dropdown). Defaults from the Part.
  * **Note** (optional, free text).
  * **Quantities** (all integers):

    * **Needed** (editable; can originate from project UI).
    * **Ordered** (editable when line is **Ordered**).
    * **Received** (read-only aggregate of receives; updated via “Update Stock” flow).
  * **Line Status**: **New → Ordered → Done** (you set it; not auto-derived).

## 2.2 Visual progress (multi-shipment)

* Lines show **Needed / Ordered / Received** at a glance.
* A line can be **Done** regardless of numbers (you explicitly mark it when you’ve reconciled it). If mismatched, show a gentle confirmation (“Quantities don’t match—mark done anyway?”).

# 3) Core flows

## 3.1 Create & compose a shopping list (Concept)

**Goal:** Quickly compose a list by picking existing parts and quantities.

**Screen: Lists Overview**

* Create **New List** → enter *Name* (e.g., “Project X – Rev A”), optional *Description*.
* See lists grouped by **Active** (Concept/Ready) and **Archived**.

**Screen: List (Concept view)**

* Table (“editable grid”):

  * Columns: Part (search & pick), Seller (dropdown, default from Part), Needed, Ordered (read-only here), Received (read-only), Note, Actions.
  * Add rows via “Add part” (search box + **+** button) or from Part detail (see 3.4).
  * Prevent duplicate parts from being added. If the same part is added, show an error and require the user to update the quantity on the other line.
  * **Validation:** Part is required; Needed ≥ 1. Duplicates on the same list are prevented by validation.
  * **Sorting:** Part description, by Part (ID/MPN), Category, Date added.
  * **Confirmations:** Deleting a line or clearing the list asks for confirmation.

**Actions**

* **Mark list “Ready for Ordering”** → switches to seller-centric ordering view. (You can still go back to Concept if nothing has been marked Ordered yet.)

## 3.2 Order planning (Ready for Ordering)

**Goal:** Prepare and record orders without prices; group by Seller.

**Screen: List (Ordering view)**

* **Grouped by Seller** (Seller = line’s override or Part’s default).
* **Per-seller group header**:

  * Seller name, **Order Note** (e.g., order #, ETA), **Mark group as Ordered** action.
* **Per line**:

  * Shows Part, Needed, **Ordered (editable here)**, Received, Note, **Line Status chip**.
  * **Mark as Ordered** (per line) sets status=Ordered; **Ordered** quantity must be set/confirmed.
* **Bulk action**: **Mark group as Ordered** sets each line in the group to Ordered and prompts for Ordered quantities (prefill = Needed).

**Rules**

* When Seller override changes, the line moves to that seller’s group.
* Still no receiving here; receiving happens via “Update Stock” on **Ordered** lines.

## 3.3 Receive & update stock (line by line)

**Entry points:**

* From the list (any view), **Ordered** lines show **Update Stock**.
* From Part detail, you also see indicators that it appears on lists (with links).
* From Part tile an icon shows that the part appears on any not-done shopping lists. Hovering over the icon shows a popup with the links to the lists the part is on.

**Update Stock modal (for one line)**

* Header: Part + Seller, current **Ordered** and **Received** totals.
* **Receive now**:

  * Input: **Quantity to receive now** (integer ≥ 1).
  * **Allocate to locations**: show existing locations for this Part (if any) and allow:

    * Increase quantity in an existing location.
    * Add a new location.
  * Upon save: increment **Received** (line) and update Part stock + location(s). (Quantity history for the Part continues to be timestamped, as per brief.)
* **Mark line as Done** (separate button):

  * Sets Line Status = Done (archived semantics). Allowed even if Received ≠ Ordered; ask for confirmation if mismatched.
* **Save & next** to step through remaining **Ordered** lines.

**Rules & guards**

* **Update Stock** only visible for lines with status **Ordered** (prevents intake from Concept/New).
* Changing Part on a line is **blocked** once the line is **Done**.

## 3.4 Add from Part detail

**On Part detail:**

* **Add to shopping list** button: choose an existing **Concept** list or **create new**; set Needed and optional Note; choose Seller override (defaults to Part’s seller).
* **Badges**: show which lists (by name) currently include this Part; clicking navigates to the list.

# 4) Seller Registry (enabler)

**Goal:** Clean seller handling & grouping.

**Seller management**

* Simple screen: **Name** (required), optional Website.
* Parts reference a **Seller** (ID). Keep the existing **seller link** on Part as the product page URL.

**In Shopping List**

* Each line shows a **Seller** dropdown (short list; not searchable).
* Default = Part’s Seller; can override **per line**.
* Grouping in Ordering view uses the **effective** Seller (override or default).

# 5) Screens & primary UI elements (at a glance)

1. **Lists Overview**

   * Sections: **Active** (Concept/Ready), **Archived**.
   * Card per list: name, description, counts (lines by status), last updated.
   * Actions: New List, Archive List (manual), Delete (confirm).

2. **List — Concept**

   * Editable grid with add row.
   * Columns: Part | Seller | Needed | Ordered (ro) | Received (ro) | Note | Actions (Delete).
   * Footer: **Mark Ready for Ordering**.

3. **List — Ordering**

   * Seller groups with **Order Note**, “Mark group Ordered”.
   * Lines: Part | Needed | **Ordered (editable)** | Received | Note | Status | **Update Stock** (if Ordered).
   * Toolbar: “Back to Concept” (if no lines Ordered), Sort options.

4. **Update Stock modal**

   * Input “Receive now”.
   * Location allocator (existing + add new).
   * Buttons: Save, **Mark Done**, Save & next.

5. **Part detail**

   * “Add to shopping list” button + list badges.

# 6) Behaviors & rules (summary)

* **Preventing duplicates:** User is prevented from adding the same part twice.
* **Status transitions (line):** New ↔ Ordered ↔ Done (you control it).

  * Set to **Ordered**: requires confirming **Ordered** quantity.
  * **Done**: available from Update Stock (and from list with confirmation).
* **Receiving:** Only for **Ordered** lines. Multiple receives accumulate in **Received**.
* **Done semantics:** Archive the line visually; excluded by default in Active views; still discoverable on the list.
* **List status:** Concept ↔ Ready for Ordering. Returning from Ready to Concept is allowed **only if no line is Ordered**.
* **Delete vs Archive:** Deleting a line or a list always requires confirmation. By default you **keep** lists (aligns with “keep history” spirit).
* **Guards:** Prevent “Update Stock” on Concept/New; warn on Done with mismatched quantities; prevent changing Part once Done.
* **Sorting:** Manual drag (Concept), and by Part/Category/Date in both views.

# 7) Acceptance criteria (sliceable stories)

**A. Create & manage lists**

* Can create, rename, describe, archive, delete lists (with confirmations).
* Concept view shows an editable grid; can add Parts, set Needed, Note, Seller.
* Duplicate Part adds merge into one line and sum Needed.

**B. Ready for Ordering**

* Toggling list to Ready shows seller groups with group-level **Order Note**.
* Per line and per seller group, can set **Ordered** and mark **Ordered**.
* Changing Seller re-groups the line.

**C. Receive & mark done**

* **Update Stock** only available on **Ordered** lines.
* Modal supports partial quantities; updates Part locations and **Received** total.
* Can **Mark Done** irrespective of numeric balance, with confirmation.
* Lines marked Done collapse out of the default view but remain on the list.

**D. Add from Part detail**

* From a Part, can add to an existing **Concept** list or create a new one.
* Part detail shows badges for lists containing the Part.

**E. Seller registry (enabler)**

* CRUD for Sellers (name required).
* Part has a default Seller; Shopping List line can override via dropdown.
* Ordering view groups by effective Seller.

# 8) Scope boundaries (explicitly out for now)

* No prices, budgets, or links to invoices.
* No exports/print/QR.
* No complex filters; add later if volume demands.
* No auto location suggestions beyond “use existing locations” in Update Stock (future feature can extend).
* No per-line project linkage beyond list naming/description.
* No project functionality. Projects have not been implemented yet.

# 9) Notes for designers

* **Copy tone:** terse, tool-like; emphasize clarity (“Needed / Ordered / Received” labels).
* **Affordances:** badges for status; chips for seller; clear CTA for **Update Stock**.
* **Keyboard-light:** no global hotkeys; simple tab order in grids.
* **Mobile:** not optimized for in-store; desktop-first is fine.