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
  sellerName: string;
  kit: { id: number };
  pickList: { id: number };
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

  await testData.kits.addContent(kit.id, {
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

  return {
    box,
    part,
    sellerName: seller.name,
    kit,
    pickList,
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

  // -- Part detail ---------------------------------------------------------

  test('part detail: renders content but hides edit, delete, and overflow menu', async ({
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

  test('kit detail: renders content but hides order, edit, menu, and add-part buttons', async ({
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
  });

  // -- Pick-list detail ----------------------------------------------------

  test('pick-list detail: renders content but hides delete button; view PDF remains visible', async ({
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
  }) => {
    // -- Boxes list: Add Box button visible --------------------------------
    await boxes.gotoList();
    await expect(boxes.addButton).toBeVisible();

    // -- Box detail: edit and delete visible --------------------------------
    await boxes.openDetail(seed.box.box_no);
    await expect(boxes.detailEditButton).toBeVisible();
    await expect(boxes.detailDeleteButton).toBeVisible();

    // -- Part detail: action bar visible ------------------------------------
    await parts.goto(`/parts/${seed.part.key}`);
    await parts.waitForDetailReady();
    await expect(parts.editPartButton).toBeVisible();
    await expect(parts.deletePartButton).toBeVisible();
    await expect(parts.overflowMenuButton).toBeVisible();

    // Seller link add button visible
    await expect(parts.sellerLinksAddButton).toBeVisible();

    // Seller link remove button is enabled (not the disabled fallback)
    const row = parts.sellerLinkRowByName(seed.sellerName);
    await expect(row).toBeVisible();
    const removeButton = parts.sellerLinkRemoveButton(row);
    await expect(removeButton).toBeVisible();
    await expect(removeButton).toBeEnabled();

    // -- Kit detail: all header actions and BOM add button visible ----------
    await kits.goto(`/kits/${seed.kit.id}`);
    await waitForListLoading(page, 'kits.detail', 'ready');
    await expect(kits.detailOrderButton).toBeVisible();
    await expect(kits.detailEditButton).toBeVisible();
    await expect(kits.detailMenuButton).toBeVisible();
    await expect(kits.detailAddPartButton).toBeVisible();

    // -- Pick-list detail: delete button visible ----------------------------
    const plReady = waitForListLoading(page, 'pickLists.detail', 'ready');
    await pickLists.gotoDetail(seed.pickList.id);
    await plReady;
    await expect(pickLists.deleteButton).toBeVisible();
    await expect(pickLists.viewPdfButton).toBeVisible();
  });
});
