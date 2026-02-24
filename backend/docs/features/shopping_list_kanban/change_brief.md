# Shopping List Kanban — Change Brief

Refactor the shopping list backend to support a Kanban-style UI redesign. Three major areas of change:

1. **Status simplification**: Replace the `concept | ready | done` tristate on shopping lists with `active | done`. The `active` state covers both the compiling and ordering phases. The only transition is `active → done`, with no preconditions.

2. **Persistent seller groups**: Refactor the computed seller groups and `shopping_list_seller_notes` table into a new `shopping_list_sellers` table that persists seller group membership, order notes, and group status (`active | ordered`). Seller groups become a first-class entity with full CRUD endpoints. Ordering a seller group transitions all its lines to ORDERED status atomically.

3. **Endpoint restructuring**: Remove individual line ordering/reverting endpoints. Add seller group CRUD endpoints. Remove the bulk group order endpoint. The line PUT endpoint gains the ability to set `ordered` quantity. The order-note upsert endpoint is folded into the seller group PUT.

See `backend_implementation.md` in this directory for the full set of design decisions made with the frontend developer.
