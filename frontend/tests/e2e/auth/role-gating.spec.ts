/**
 * Role Gating E2E Tests
 *
 * Exercises the Gate component system end-to-end:
 * - Reader-role users see read-only content but not editor-only controls
 * - Editor-role users see all controls
 * - Gate fallback elements render their disabled variant for readers
 *
 * Data is seeded via Node-level API factories (bypassing browser session),
 * then a constrained session is set via auth.createSession() before navigation.
 */

import { test, expect } from '../../support/fixtures';
import { waitForListLoading } from '../../support/helpers';
import type { createApiClient, createTestDataBundle } from '../../api';

// ---------------------------------------------------------------------------
// Shared seed helper: creates all entities needed across the test groups.
// Returns enough metadata to navigate to each detail page.
// ---------------------------------------------------------------------------

interface SeedData {
  box: { box_no: number };
  part: { key: string };
  sellerId: number;
  sellerName: string;
  kit: { id: number };
  kitContentId: number;
  pickList: { id: number };
  shoppingList: { id: number };
  shoppingListLineId: number;
  typeName: string;
}

async function seedTestData(
  testData: ReturnType<typeof createTestDataBundle>,
  apiClient: ReturnType<typeof createApiClient>,
): Promise<SeedData> {
  // Box
  const box = await testData.boxes.create({
    overrides: { description: testData.boxes.randomBoxDescription() },
  });

  // Part (with a seller link so we can test the Gate fallback)
  const { part } = await testData.parts.create({
    overrides: { description: testData.parts.randomPartDescription('RoleGate Part') },
  });

  const seller = await testData.sellers.create({
    overrides: { name: testData.sellers.randomSellerName('RoleGate Seller') },
  });
  await testData.sellers.createPartSellerLink(
    part.key,
    seller.id,
    'https://example.com/product/role-gate-test',
  );

  // Kit -- we need partId for addContent; retrieve via kit-reservations endpoint
  const reservations = await apiClient.apiRequest(() =>
    apiClient.GET('/api/parts/{part_key}/kit-reservations', {
      params: { path: { part_key: part.key } },
    }),
  );

  const kit = await testData.kits.create({
    overrides: {
      name: testData.kits.randomKitName('RoleGate Kit'),
      build_target: 1,
    },
  });

  const kitContent = await testData.kits.addContent(kit.id, {
    partId: reservations.part_id,
    requiredPerUnit: 1,
  });

  // Stock the part so the pick list can be created
  await apiClient.apiRequest(() =>
    apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: part.key } },
      body: { box_no: box.box_no, loc_no: 1, qty: 10 },
    }),
  );

  // Pick list
  const pickList = await testData.kits.createPickList(kit.id, {
    requestedUnits: 1,
  });

  // Shopping list (for detail-page gate tests) with a line for kanban card tests
  const shoppingList = await testData.shoppingLists.create();
  const shoppingListLine = await testData.shoppingLists.createLine(shoppingList.id, {
    partKey: part.key,
    needed: 1,
  });

  // Type (for types list gate tests)
  const type = await testData.types.create({
    name: testData.types.randomTypeName('RoleGate Type'),
  });

  return {
    box,
    part,
    sellerId: seller.id,
    sellerName: seller.name,
    kit,
    kitContentId: kitContent.id,
    pickList,
    shoppingList,
    shoppingListLineId: shoppingListLine.id,
    typeName: type.name,
  };
}

// ===================================================================
// Reader-role tests
// ===================================================================

test.describe('Role gating — reader role', () => {
  let seed: SeedData;

  test.beforeEach(async ({ testData, apiClient, auth }) => {
    // 1. Seed data via Node-level API client (no role restrictions)
    seed = await seedTestData(testData, apiClient);

    // 2. Establish a reader-only browser session
    await auth.createSession({ roles: ['reader'] });
  });

  // -- Boxes list ----------------------------------------------------------

  test('boxes list: renders content but hides Add Box button', async ({ boxes }) => {
    await boxes.gotoList();

    // Read-only content is accessible
    await expect(boxes.summary).toBeVisible();
    await boxes.expectCardVisible(seed.box.box_no);

    // Editor-only Add Box button is hidden by Gate
    await expect(boxes.addButton).not.toBeVisible();
  });

  // -- Box detail ----------------------------------------------------------

  test('box detail: renders content but hides edit and delete buttons', async ({ boxes }) => {
    await boxes.gotoList();
    await boxes.openDetail(seed.box.box_no);

    // Read-only content
    await expect(boxes.detailSummary).toBeVisible();
    await expect(boxes.detailLocations).toBeVisible();

    // Editor-only controls hidden
    await expect(boxes.detailEditButton).not.toBeVisible();
    await expect(boxes.detailDeleteButton).not.toBeVisible();
  });

  // -- Parts list ----------------------------------------------------------

  test('parts list: hides Add Part and Add Part with AI buttons', async ({ parts }) => {
    await parts.gotoList();

    // Read-only browsing available
    await expect(parts.root).toBeVisible();

    // Editor-only creation buttons hidden
    await expect(parts.addPartButton).not.toBeVisible();
    await expect(parts.addWithAIButton).not.toBeVisible();
  });

  // -- Part detail ---------------------------------------------------------

  test('part detail: renders content but hides edit, delete, overflow, and Add Document', async ({
    page,
    parts,
  }) => {
    await parts.goto(`/parts/${seed.part.key}`);
    await parts.waitForDetailReady();

    // Read-only content
    await expect(parts.detailLayout).toBeVisible();

    // Editor-only action bar hidden (entire bar wrapped in one Gate)
    await expect(parts.editPartButton).not.toBeVisible();
    await expect(parts.deletePartButton).not.toBeVisible();
    await expect(parts.overflowMenuButton).not.toBeVisible();

    // Add Document button hidden
    await expect(parts.detailAddDocumentButton).not.toBeVisible();

    // Stock location mutation buttons hidden (the part has seeded stock)
    await expect(page.getByTestId('parts.locations')).toBeVisible();
    await expect(page.getByTestId('parts.locations.adjust-stock').first()).not.toBeVisible();
    await expect(page.getByTestId('parts.locations.edit').first()).not.toBeVisible();
    await expect(page.getByTestId('parts.locations.remove').first()).not.toBeVisible();
    await expect(page.getByTestId('parts.locations.add-location')).not.toBeVisible();
  });

  // -- Seller link fallback ------------------------------------------------

  test('seller link: remove button renders disabled fallback; add button hidden', async ({
    parts,
  }) => {
    await parts.goto(`/parts/${seed.part.key}`);
    await parts.waitForDetailReady();

    // Seller links section is visible with the seeded link
    await expect(parts.sellerLinksSection).toBeVisible();
    const row = parts.sellerLinkRowByName(seed.sellerName);
    await expect(row).toBeVisible();

    // Remove button: Gate fallback renders a disabled button with title
    const removeButton = parts.sellerLinkRemoveButton(row);
    await expect(removeButton).toBeVisible();
    await expect(removeButton).toBeDisabled();
    await expect(removeButton).toHaveAttribute('title', 'Editor role required');

    // Add Seller Link button: Gate without fallback, so nothing renders
    await expect(parts.sellerLinksAddButton).not.toBeVisible();
  });

  // -- Kit detail ----------------------------------------------------------

  test('kit detail: renders content but hides order, edit, menu, add-part, and Add Document buttons', async ({
    page,
    kits,
  }) => {
    await kits.goto(`/kits/${seed.kit.id}`);
    await waitForListLoading(page, 'kits.detail', 'ready');
    await expect(kits.detailLayout).toBeVisible();

    // Header action buttons hidden
    await expect(kits.detailOrderButton).not.toBeVisible();
    await expect(kits.detailEditButton).not.toBeVisible();
    await expect(kits.detailMenuButton).not.toBeVisible();

    // BOM "Add part" button hidden
    await expect(kits.detailAddPartButton).not.toBeVisible();

    // BOM row edit and delete buttons hidden
    await expect(page.getByTestId(`kits.detail.table.row.${seed.kitContentId}.edit`)).not.toBeVisible();
    await expect(page.getByTestId(`kits.detail.table.row.${seed.kitContentId}.delete`)).not.toBeVisible();

    // Add Document button hidden
    await expect(page.getByTestId('kits.detail.documents.add')).not.toBeVisible();
  });

  // -- Pick-list detail ----------------------------------------------------

  test('pick-list detail: renders content but hides delete, pick, and edit-quantity buttons', async ({
    page,
    pickLists,
  }) => {
    const listReady = waitForListLoading(page, 'pickLists.detail', 'ready');
    await pickLists.gotoDetail(seed.pickList.id);
    await listReady;

    await expect(pickLists.layout).toBeVisible();
    await expect(pickLists.title).toBeVisible();

    // Editor-only delete button hidden
    await expect(pickLists.deleteButton).not.toBeVisible();

    // Read-only View PDF button remains accessible
    await expect(pickLists.viewPdfButton).toBeVisible();

    // Pick action buttons hidden for all lines
    await expect(page.locator('[data-testid$=".action.pick"]')).toHaveCount(0);

    // Edit-quantity pencil buttons hidden for all lines
    await expect(page.locator('[data-testid$=".quantity-edit"]')).toHaveCount(0);
  });

  // -- Shopping lists overview ---------------------------------------------

  test('shopping lists overview: hides Add Shopping List button', async ({
    shoppingLists,
  }) => {
    await shoppingLists.gotoOverview();

    // Read-only content is accessible
    await expect(shoppingLists.overviewRoot).toBeVisible();

    // Editor-only Add Shopping List button is hidden by Gate
    await expect(shoppingLists.overviewCreateButton).not.toBeVisible();
  });

  // -- Shopping list detail ------------------------------------------------

  test('shopping list detail: hides Edit List, Delete List, add-part, skeleton column, and card delete', async ({
    page,
    shoppingLists,
  }) => {
    await shoppingLists.goto(`/shopping-lists/${seed.shoppingList.id}`);
    await waitForListLoading(page, 'shoppingLists.detail.kits', 'ready');

    // Read-only content is accessible
    await expect(shoppingLists.detailLayout).toBeVisible();

    // Editor-only header buttons hidden
    await expect(page.getByTestId('shopping-lists.detail.header.edit')).not.toBeVisible();
    await expect(page.getByTestId('shopping-lists.detail.header.delete')).not.toBeVisible();

    // Kanban board and unassigned column visible, but editor-only add-part hidden
    await expect(page.getByTestId('shopping-lists.kanban.board')).toBeVisible();
    await expect(page.getByTestId('shopping-lists.kanban.column.ungrouped.add-part')).not.toBeVisible();

    // Skeleton column (Add Seller) hidden for readers
    await expect(shoppingLists.kanbanSkeletonColumn).not.toBeVisible();

    // Kanban card delete button hidden for readers (line was seeded in unassigned column)
    await expect(
      page.getByTestId(`shopping-lists.kanban.card.${seed.shoppingListLineId}.delete`)
    ).not.toBeVisible();
  });

  // -- Kits overview -------------------------------------------------------

  test('kits overview: hides Add Kit button', async ({ kits }) => {
    await kits.gotoOverview();

    // Read-only content is accessible
    await expect(kits.overviewRoot).toBeVisible();

    // Editor-only Add Kit button is hidden by Gate
    await expect(kits.newKitButton).not.toBeVisible();
  });

  // -- Kit detail pick list panel ------------------------------------------

  test('kit detail: pick list panel hides Add Pick List button', async ({
    page,
    kits,
  }) => {
    await kits.goto(`/kits/${seed.kit.id}`);
    await waitForListLoading(page, 'kits.detail', 'ready');

    await expect(kits.pickListPanel).toBeVisible();

    // Editor-only Add Pick List button is hidden by Gate
    await expect(kits.pickListPanelAddButton).not.toBeVisible();
  });

  // -- Sellers list --------------------------------------------------------

  test('sellers list: hides Add Seller button and card edit/delete buttons', async ({
    sellers,
  }) => {
    await sellers.gotoList();

    // Read-only content is accessible
    await expect(sellers.root).toBeVisible();

    // Editor-only Add Seller button is hidden by Gate
    await expect(sellers.addButton).not.toBeVisible();

    // Card-level edit and delete buttons are hidden
    const sellerCard = sellers.root.getByTestId(`sellers.list.item.${seed.sellerId}`);
    await expect(sellerCard).toBeVisible();
    await expect(sellerCard.getByRole('button', { name: 'Edit' })).not.toBeVisible();
    await expect(sellerCard.getByRole('button', { name: 'Delete' })).not.toBeVisible();
  });

  // -- Types list ----------------------------------------------------------

  test('types list: hides Add Type button and card edit/delete buttons', async ({
    types,
  }) => {
    await types.goto();
    await types.waitForListState('ready');

    // Read-only content is accessible
    await expect(types.root).toBeVisible();

    // Editor-only Add Type button is hidden by Gate
    await expect(types.createButton).not.toBeVisible();

    // Card-level edit and delete buttons are hidden
    const typeCard = types.listContainer.locator('[data-testid="types.list.card"]').filter({
      hasText: seed.typeName,
    });
    await expect(typeCard).toBeVisible();
    await expect(typeCard.getByRole('button', { name: 'Edit' })).not.toBeVisible();
    await expect(typeCard.getByRole('button', { name: 'Delete' })).not.toBeVisible();
  });
});

// ===================================================================
// Editor-role contrasting tests
// ===================================================================

test.describe('Role gating — editor role', () => {
  let seed: SeedData;

  test.beforeEach(async ({ testData, apiClient, auth }) => {
    seed = await seedTestData(testData, apiClient);

    // Editor session: both reader and editor roles
    await auth.createSession({ roles: ['reader', 'editor'] });
  });

  test('editor sees all gated controls across domains', async ({
    page,
    boxes,
    parts,
    kits,
    pickLists,
    shoppingLists,
    sellers,
    types,
  }) => {
    // -- Boxes list: Add Box button visible --------------------------------
    await boxes.gotoList();
    await expect(boxes.addButton).toBeVisible();

    // -- Box detail: edit and delete visible --------------------------------
    await boxes.openDetail(seed.box.box_no);
    await expect(boxes.detailEditButton).toBeVisible();
    await expect(boxes.detailDeleteButton).toBeVisible();

    // -- Parts list: Add Part and Add Part with AI visible ------------------
    await parts.gotoList();
    await expect(parts.addPartButton).toBeVisible();
    await expect(parts.addWithAIButton).toBeVisible();

    // -- Part detail: action bar, Add Document, and location buttons visible ---
    await parts.goto(`/parts/${seed.part.key}`);
    await parts.waitForDetailReady();
    await expect(parts.editPartButton).toBeVisible();
    await expect(parts.deletePartButton).toBeVisible();
    await expect(parts.overflowMenuButton).toBeVisible();

    // Add Document button visible
    await expect(parts.detailAddDocumentButton).toBeVisible();

    // Stock location mutation buttons visible
    await expect(page.getByTestId('parts.locations.adjust-stock').first()).toBeVisible();
    await expect(page.getByTestId('parts.locations.edit').first()).toBeVisible();
    await expect(page.getByTestId('parts.locations.remove').first()).toBeVisible();
    await expect(page.getByTestId('parts.locations.add-location')).toBeVisible();

    // Seller link add button visible
    await expect(parts.sellerLinksAddButton).toBeVisible();

    // Seller link remove button is enabled (not the disabled fallback)
    const row = parts.sellerLinkRowByName(seed.sellerName);
    await expect(row).toBeVisible();
    const removeButton = parts.sellerLinkRemoveButton(row);
    await expect(removeButton).toBeVisible();
    await expect(removeButton).toBeEnabled();

    // -- Kit overview: Add Kit button visible --------------------------------
    await kits.gotoOverview();
    await expect(kits.newKitButton).toBeVisible();

    // -- Kit detail: all header actions, BOM add button, and pick list add ---
    await kits.goto(`/kits/${seed.kit.id}`);
    await waitForListLoading(page, 'kits.detail', 'ready');
    await expect(kits.detailOrderButton).toBeVisible();
    await expect(kits.detailEditButton).toBeVisible();
    await expect(kits.detailMenuButton).toBeVisible();
    await expect(kits.detailAddPartButton).toBeVisible();
    await expect(kits.pickListPanelAddButton).toBeVisible();

    // BOM row edit and delete buttons visible
    await expect(page.getByTestId(`kits.detail.table.row.${seed.kitContentId}.edit`)).toBeVisible();
    await expect(page.getByTestId(`kits.detail.table.row.${seed.kitContentId}.delete`)).toBeVisible();

    // Kit Add Document button visible
    await expect(page.getByTestId('kits.detail.documents.add')).toBeVisible();

    // -- Pick-list detail: delete and pick buttons visible -------------------
    const plReady = waitForListLoading(page, 'pickLists.detail', 'ready');
    await pickLists.gotoDetail(seed.pickList.id);
    await plReady;
    await expect(pickLists.deleteButton).toBeVisible();
    await expect(pickLists.viewPdfButton).toBeVisible();

    // Pick button and edit-quantity pencil visible for lines
    await expect(page.locator('[data-testid$=".action.pick"]').first()).toBeVisible();
    await expect(page.locator('[data-testid$=".quantity-edit"]').first()).toBeVisible();

    // -- Shopping lists overview: Add Shopping List button visible ----------
    await shoppingLists.gotoOverview();
    await expect(shoppingLists.overviewCreateButton).toBeVisible();

    // -- Shopping list detail: Edit and Delete buttons visible --------------
    await shoppingLists.goto(`/shopping-lists/${seed.shoppingList.id}`);
    await waitForListLoading(page, 'shoppingLists.kanban', 'ready');
    await expect(page.getByTestId('shopping-lists.detail.header.edit')).toBeVisible();
    await expect(page.getByTestId('shopping-lists.detail.header.delete')).toBeVisible();
    await expect(page.getByTestId('shopping-lists.kanban.board')).toBeVisible();
    await expect(page.getByTestId('shopping-lists.kanban.column.ungrouped.add-part')).toBeVisible();

    // Skeleton column (Add Seller) visible for editors
    await expect(shoppingLists.kanbanSkeletonColumn).toBeVisible();

    // Kanban card delete button visible for editors (line is in unassigned column with new status)
    await expect(
      page.getByTestId(`shopping-lists.kanban.card.${seed.shoppingListLineId}.delete`)
    ).toBeVisible();

    // -- Sellers list: Add Seller and card edit/delete visible --------------
    await sellers.gotoList();
    await expect(sellers.addButton).toBeVisible();
    const sellerCard = sellers.root.getByTestId(`sellers.list.item.${seed.sellerId}`);
    await expect(sellerCard.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(sellerCard.getByRole('button', { name: 'Delete' })).toBeVisible();

    // -- Types list: Add Type and card edit/delete visible ------------------
    await types.goto();
    await types.waitForListState('ready');
    await expect(types.createButton).toBeVisible();
    const typeCard = types.listContainer.locator('[data-testid="types.list.card"]').filter({
      hasText: seed.typeName,
    });
    await expect(typeCard.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(typeCard.getByRole('button', { name: 'Delete' })).toBeVisible();
  });
});
