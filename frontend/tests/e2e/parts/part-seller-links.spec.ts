import { test, expect } from '../../support/fixtures';
import { waitTestEvent, waitForListLoading } from '../../support/helpers';

test.describe('Parts - Seller Link Management', () => {
  test('seller links section is always visible on detail page (even when empty)', async ({
    parts,
    testData,
  }) => {
    // Seed a part with no seller links
    const { part } = await testData.parts.create({
      overrides: { description: 'Empty Seller Links Part' },
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);
    await parts.waitForDetailReady();

    // Section is visible with empty state text and add button
    await expect(parts.sellerLinksSection).toBeVisible();
    await expect(parts.sellerLinksEmpty).toBeVisible();
    await expect(parts.sellerLinksEmpty).toHaveText('No seller links yet.');
    await expect(parts.sellerLinksAddButton).toBeVisible();
  });

  test('adds a seller link to a part via inline form', async ({
    page,
    parts,
    testData,
  }) => {
    // Seed a part and a seller
    const { part } = await testData.parts.create({
      overrides: { description: 'Add Seller Link Part' },
    });
    const seller = await testData.sellers.create({
      overrides: { name: testData.sellers.randomSellerName('TestVendor') },
    });
    const productUrl = 'https://example.com/product/12345';

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);
    await parts.waitForDetailReady();

    // Open the add form
    await parts.sellerLinksAddButton.click();
    await expect(parts.sellerLinksForm).toBeVisible();

    // Select seller using the page object's SellerSelectorHarness
    const sellerHarness = parts.createSellerLinkSelectorHarness();
    await sellerHarness.waitForReady();
    await sellerHarness.search(seller.name);
    await sellerHarness.selectOption(seller.name);

    // Fill in the URL
    await parts.sellerLinksFormLinkInput.fill(productUrl);

    // Submit and wait for success instrumentation + detail refresh
    await Promise.all([
      waitTestEvent(page, 'form', (evt: { formId: string; phase: string }) =>
        evt.formId === 'parts.detail.sellerLink.add' && evt.phase === 'success',
      ),
      parts.sellerLinksFormSubmit.click(),
    ]);

    await waitForListLoading(page, 'parts.detail', 'ready');

    // Form should be closed
    await expect(parts.sellerLinksForm).toBeHidden();

    // The new seller link should appear in the list
    const row = parts.sellerLinkRowByName(seller.name);
    await expect(row).toBeVisible();
    await expect(row).toContainText(productUrl);

    // Empty state should no longer be visible
    await expect(parts.sellerLinksEmpty).toBeHidden();
  });

  test('cancel button closes the add form without submitting', async ({
    parts,
    testData,
  }) => {
    const { part } = await testData.parts.create({
      overrides: { description: 'Cancel Form Part' },
    });

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);
    await parts.waitForDetailReady();

    // Open the add form
    await parts.sellerLinksAddButton.click();
    await expect(parts.sellerLinksForm).toBeVisible();

    // Cancel
    await parts.sellerLinksFormCancel.click();
    await expect(parts.sellerLinksForm).toBeHidden();

    // Add button should be visible again
    await expect(parts.sellerLinksAddButton).toBeVisible();

    // Empty state should still be shown (no link was added)
    await expect(parts.sellerLinksEmpty).toBeVisible();
  });

  test('removes a seller link from a part', async ({
    page,
    parts,
    testData,
  }) => {
    // Seed a part + seller + seller link
    const { part } = await testData.parts.create({
      overrides: { description: 'Remove Seller Link Part' },
    });
    const seller = await testData.sellers.create({
      overrides: { name: testData.sellers.randomSellerName('RemoveVendor') },
    });
    await testData.sellers.createPartSellerLink(
      part.key,
      seller.id,
      'https://example.com/remove-me',
    );

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);
    await parts.waitForDetailReady();

    // Verify seller link row is visible
    const row = parts.sellerLinkRowByName(seller.name);
    await expect(row).toBeVisible();

    // Click remove button
    const removeBtn = parts.sellerLinkRemoveButton(row);
    await removeBtn.click();

    // Confirmation dialog should appear
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(seller.name);

    // Confirm removal
    await dialog.getByRole('button', { name: 'Remove' }).click();

    // Wait for the part detail to refresh
    await waitForListLoading(page, 'parts.detail', 'ready');

    // Seller link should be gone
    await expect(parts.sellerLinkRowByName(seller.name)).toHaveCount(0);

    // Empty state should be shown again
    await expect(parts.sellerLinksEmpty).toBeVisible();
  });

  test('removes one seller link while keeping another', async ({
    page,
    parts,
    testData,
  }) => {
    // Seed a part with two seller links
    const { part } = await testData.parts.create({
      overrides: { description: 'Multi Seller Link Part' },
    });
    const sellerA = await testData.sellers.create({
      overrides: { name: testData.sellers.randomSellerName('VendorA') },
    });
    const sellerB = await testData.sellers.create({
      overrides: { name: testData.sellers.randomSellerName('VendorB') },
    });
    await testData.sellers.createPartSellerLink(
      part.key,
      sellerA.id,
      'https://example.com/vendor-a',
    );
    await testData.sellers.createPartSellerLink(
      part.key,
      sellerB.id,
      'https://example.com/vendor-b',
    );

    await parts.gotoList();
    await parts.waitForCards();
    await parts.openCardByKey(part.key);
    await parts.waitForDetailReady();

    // Both rows are visible
    await expect(parts.sellerLinkRowByName(sellerA.name)).toBeVisible();
    await expect(parts.sellerLinkRowByName(sellerB.name)).toBeVisible();

    // Remove seller A
    const rowA = parts.sellerLinkRowByName(sellerA.name);
    const removeBtnA = parts.sellerLinkRemoveButton(rowA);
    await removeBtnA.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Remove' }).click();

    await waitForListLoading(page, 'parts.detail', 'ready');

    // Seller A is gone, seller B remains
    await expect(parts.sellerLinkRowByName(sellerA.name)).toHaveCount(0);
    await expect(parts.sellerLinkRowByName(sellerB.name)).toBeVisible();

    // Empty state should NOT be shown (one link remains)
    await expect(parts.sellerLinksEmpty).toBeHidden();
  });
});
