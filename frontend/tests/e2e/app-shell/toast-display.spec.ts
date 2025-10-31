import { test, expect } from '../../support/fixtures';
import { createToastHelper } from '../../support/helpers/toast-helpers';
import { makeUnique } from '../../support/helpers';

test.describe('Toast Display', () => {
  test('truncates long message text with ellipsis after 3 lines', async ({ page, testData, kits }) => {
    // Create a kit with a very long name to generate a long toast message
    const longName = 'Super Long Kit Name That Definitely Exceeds The Maximum Width Of The Toast Container And Should Wrap Or Truncate Properly Without Pushing The Close Button Out Of Bounds';
    const kit = await testData.kits.create({
      overrides: {
        name: longName
      }
    });

    // Navigate to kit detail page to access archive function
    await kits.gotoOverview();
    await kits.openDetailFromCard(kit.id);

    // Archive the kit to trigger a toast with the long name
    await kits.detailMenuButton.click();
    await kits.detailArchiveMenuItem.click();
    const toastHelper = createToastHelper(page);
    const toast = await toastHelper.waitForToast();

    // Verify the toast is visible
    await expect(toast).toBeVisible();

    // Get the toast title element (message)
    const messageElement = toast.locator('[class*="line-clamp"]');

    // Verify overflow handling is applied
    const hasOverflowHandling = await messageElement.first().evaluate((el) => {
      const styles = window.getComputedStyle(el);
      // Check for line-clamp or overflow-hidden
      return (
        el.classList.contains('line-clamp-3') ||
        el.classList.contains('overflow-hidden') ||
        styles.overflow === 'hidden'
      );
    });

    expect(hasOverflowHandling).toBeTruthy();

    // Verify close button is visible and clickable
    const closeButton = toast.locator('button').last();
    await expect(closeButton).toBeVisible();

    // Get the bounding boxes to verify close button is within toast bounds
    const toastBox = await toast.boundingBox();
    const closeButtonBox = await closeButton.boundingBox();

    expect(toastBox).not.toBeNull();
    expect(closeButtonBox).not.toBeNull();

    if (toastBox && closeButtonBox) {
      // Close button should be within toast container bounds
      expect(closeButtonBox.x).toBeGreaterThanOrEqual(toastBox.x);
      expect(closeButtonBox.y).toBeGreaterThanOrEqual(toastBox.y);
      expect(closeButtonBox.x + closeButtonBox.width).toBeLessThanOrEqual(toastBox.x + toastBox.width);
      expect(closeButtonBox.y + closeButtonBox.height).toBeLessThanOrEqual(toastBox.y + toastBox.height);
    }

    // Verify close button is clickable
    await closeButton.click();
    await expect(toast).not.toBeVisible();
  });

  test('close button remains visible and clickable with regular message', async ({ page, testData, kits }) => {
    // Create a kit with a normal-length name
    const kit = await testData.kits.create({
      overrides: {
        name: makeUnique('Regular Kit')
      }
    });

    await kits.gotoOverview();
    await kits.openDetailFromCard(kit.id);

    // Archive the kit to trigger a toast
    await kits.detailMenuButton.click();
    await kits.detailArchiveMenuItem.click();
    const toastHelper = createToastHelper(page);
    const toast = await toastHelper.waitForToast();

    // Verify close button is visible
    const closeButton = toast.locator('button').last();
    await expect(closeButton).toBeVisible();

    // Verify it's clickable by hovering and clicking
    await closeButton.hover();
    await closeButton.click();
    await expect(toast).not.toBeVisible();
  });

  test('toasts with action buttons auto-close after 15 seconds', async ({ page, testData, kits }) => {
    // Create and archive a kit to get a toast with undo button
    const kit = await testData.kits.create({
      overrides: {
        name: makeUnique('Test Kit')
      }
    });

    // Navigate to kit detail page to access archive function
    await kits.gotoOverview();
    await kits.openDetailFromCard(kit.id);

    // Archive the kit to trigger toast with undo
    await kits.detailMenuButton.click();
    await kits.detailArchiveMenuItem.click();
    const toastHelper = createToastHelper(page);
    const toast = await toastHelper.waitForToast();

    // Verify the undo button is present
    const undoButton = toast.locator(`[data-testid*="undo"]`);
    await expect(undoButton).toBeVisible();

    // Wait for toast to auto-dismiss (should happen at 15 seconds)
    // Use a timeout slightly longer than the expected duration
    await expect(toast).not.toBeVisible({ timeout: 16000 });
  });

  test('toasts auto-dismiss even after user hovers action button', async ({ page, testData, kits }) => {
    // Create and archive a kit to get a toast with undo button
    const kit = await testData.kits.create({
      overrides: {
        name: makeUnique('Test Kit')
      }
    });

    await kits.gotoOverview();
    await kits.openDetailFromCard(kit.id);

    await kits.detailMenuButton.click();
    await kits.detailArchiveMenuItem.click();
    const toastHelper = createToastHelper(page);
    const toast = await toastHelper.waitForToast();

    const undoButton = toast.locator(`[data-testid*="undo"]`);
    await expect(undoButton).toBeVisible();

    // Hover over the undo button for 3 seconds
    await undoButton.hover();
    await page.waitForTimeout(3000);

    // Move mouse away
    await page.mouse.move(0, 0);

    // Toast should still auto-dismiss after 15 seconds total from initial mount
    await expect(toast).not.toBeVisible({ timeout: 13000 }); // 16s - 3s already waited
  });

  test('clicking action button immediately removes toast', async ({ page, testData, kits }) => {
    // Create and archive a kit
    const kit = await testData.kits.create({
      overrides: {
        name: makeUnique('Test Kit')
      }
    });

    await kits.gotoOverview();
    await kits.openDetailFromCard(kit.id);

    await kits.detailMenuButton.click();
    await kits.detailArchiveMenuItem.click();
    const toastHelper = createToastHelper(page);
    const toast = await toastHelper.waitForToast();

    const undoButton = toast.locator(`[data-testid*="undo"]`);
    await expect(undoButton).toBeVisible();

    // Click undo button
    await undoButton.click();

    // Original toast should be removed immediately
    await expect(toast).not.toBeVisible({ timeout: 1000 });
  });
});
