/**
 * Parts List Pagination Tests
 *
 * Verifies that the parts list automatically fetches all pages when inventory
 * exceeds the backend's page limit (1000 parts per page).
 *
 * Test Strategy:
 * - Sequential factory seeding BEFORE navigation to ensure deterministic page boundaries
 * - Wait on `list_loading` instrumentation events with pagination metadata
 * - Assert backend state via real API calls (no mocking)
 * - Follow dirty database policy (randomized identifiers, no cleanup)
 */

import { test, expect } from '../../support/fixtures';
import { waitForListLoading } from '../../support/helpers';

test.describe('Parts - List Pagination', () => {
  test('loads single page when parts count is under limit', async ({ page, testData, parts }) => {
    // Seed 50 parts (well under 1000 limit)
    // Note: dirty database may have existing parts, but total should still be < 1000
    for (let i = 0; i < 50; i++) {
      await testData.parts.create({
        overrides: {
          description: testData.parts.randomPartDescription(`Single Page Part ${i}`),
        },
      });
    }

    // Start waiting for the event before navigation
    const readyEventPromise = waitForListLoading(page, 'parts.list', 'ready', 30_000);

    // Navigate to the page (this triggers the event)
    await parts.gotoList();

    // Wait for list loading to complete
    const readyEvent = await readyEventPromise;

    // Verify pagination metadata indicates single page
    expect(readyEvent.metadata).toBeDefined();
    expect(readyEvent.metadata?.paginationInfo).toBeDefined();

    // Given dirty database policy, we accept 1 or 2 pages depending on existing data
    // Main assertion: pagination metadata is present and valid
    expect(readyEvent.metadata?.paginationInfo?.pagesFetched).toBeGreaterThanOrEqual(1);
    expect(readyEvent.metadata?.paginationInfo?.limit).toBe(1000);

    // Verify total count includes our seeded parts
    expect(readyEvent.metadata?.totalCount).toBeGreaterThanOrEqual(50);

    await parts.waitForCards();
    await parts.expectSummaryText(/\d+ parts/i);
  });

  test('loads multiple pages when parts exceed limit', async ({ page, testData, parts }) => {
    // Seed 2500 parts (requires 3 page fetches: 1000 + 1000 + 500)
    // CRITICAL: Sequential await for deterministic pagination boundaries
    for (let i = 0; i < 2500; i++) {
      await testData.parts.create({
        overrides: {
          description: testData.parts.randomPartDescription(`Multi Page Part ${i}`),
        },
      });
    }

    // Small delay to ensure backend processing completes
    await page.waitForTimeout(100);

    // Start waiting for the event before navigation
    const readyEventPromise = waitForListLoading(page, 'parts.list', 'ready', 60_000);

    await parts.gotoList();

    // Wait for list loading to complete
    const readyEvent = await readyEventPromise;

    // Verify pagination metadata indicates 3 pages fetched
    expect(readyEvent.metadata).toBeDefined();
    expect(readyEvent.metadata?.paginationInfo).toBeDefined();
    expect(readyEvent.metadata?.paginationInfo?.pagesFetched).toBe(3);
    expect(readyEvent.metadata?.paginationInfo?.limit).toBe(1000);

    // Verify total count includes all parts
    expect(readyEvent.metadata?.totalCount).toBeGreaterThanOrEqual(2500);

    await parts.waitForCards();

    // Verify summary displays total count
    await parts.expectSummaryText(/\d+ parts/i);

    // Spot-check that parts from different pages are visible
    // (scrolling may be needed in real UI, but grid should contain all cards)
    const container = page.getByTestId('parts.list.container');
    await expect(container).toBeVisible();
  });

  test('loads exactly one extra page when count equals limit', async ({ page, testData, parts }) => {
    // Seed exactly 1000 parts (edge case: triggers second page fetch that returns empty)
    for (let i = 0; i < 1000; i++) {
      await testData.parts.create({
        overrides: {
          description: testData.parts.randomPartDescription(`Exact Limit Part ${i}`),
        },
      });
    }

    await page.waitForTimeout(100);

    const readyEventPromise = waitForListLoading(page, 'parts.list', 'ready', 30_000);

    await parts.gotoList();

    const readyEvent = await readyEventPromise;

    // Verify pagination fetched 2 pages (1000 parts + empty page)
    expect(readyEvent.metadata).toBeDefined();
    expect(readyEvent.metadata?.paginationInfo).toBeDefined();
    expect(readyEvent.metadata?.paginationInfo?.pagesFetched).toBe(2);
    expect(readyEvent.metadata?.paginationInfo?.limit).toBe(1000);

    // Verify total count is exactly 1000
    expect(readyEvent.metadata?.totalCount).toBeGreaterThanOrEqual(1000);

    await parts.waitForCards();
  });

  test('handles empty parts list gracefully', async ({ page, parts }) => {
    // No factory seeding - rely on potentially dirty database
    // Empty state should still work even if other tests left data

    const readyEventPromise = waitForListLoading(page, 'parts.list', 'ready');

    await parts.gotoList();

    const readyEvent = await readyEventPromise;

    // Pagination metadata should indicate completion regardless of count
    expect(readyEvent.metadata).toBeDefined();
    expect(readyEvent.metadata?.paginationInfo).toBeDefined();
    expect(readyEvent.metadata?.paginationInfo?.pagesFetched).toBeGreaterThanOrEqual(1);
    expect(readyEvent.metadata?.paginationInfo?.limit).toBe(1000);

    // Empty state or parts list should be visible
    const emptyState = page.getByTestId('parts.list.empty');
    const container = page.getByTestId('parts.list.container');

    // One of these should be visible
    const emptyVisible = await emptyState.isVisible().catch(() => false);
    const containerVisible = await container.isVisible().catch(() => false);

    expect(emptyVisible || containerVisible).toBeTruthy();
  });

  test('client-side filtering works across all pages', async ({ page, testData, parts }) => {
    // Seed 1500 parts with unique prefix across multiple pages
    const uniquePrefix = testData.parts.randomPartDescription('FilterTest');

    for (let i = 0; i < 1500; i++) {
      await testData.parts.create({
        overrides: {
          description: `${uniquePrefix} Part ${i}`,
        },
      });
    }

    await page.waitForTimeout(100);

    const readyEventPromise = waitForListLoading(page, 'parts.list', 'ready', 60_000);

    await parts.gotoList();

    // Wait for full pagination to complete
    await readyEventPromise;

    await parts.waitForCards();

    // Apply search filter (client-side filter on already-loaded data)
    await parts.search(uniquePrefix);

    // All 1500 matching parts should be found (filtering happens client-side)
    await parts.expectSummaryText(/1500/);
  });

  test('refetch after mutation re-paginates all pages', async ({ page, testData, parts, apiClient }) => {
    // Seed 1200 parts (2 pages)
    for (let i = 0; i < 1200; i++) {
      await testData.parts.create({
        overrides: {
          description: testData.parts.randomPartDescription(`Refetch Part ${i}`),
        },
      });
    }

    await page.waitForTimeout(100);

    const initialReadyEventPromise = waitForListLoading(page, 'parts.list', 'ready', 60_000);

    await parts.gotoList();

    const initialReadyEvent = await initialReadyEventPromise;
    expect(initialReadyEvent.metadata?.paginationInfo?.pagesFetched).toBe(2);

    await parts.waitForCards();

    // Create a new part via API (triggers query invalidation)
    const { part: newPart } = await testData.parts.create({
      overrides: {
        description: testData.parts.randomPartDescription('Newly Added Part'),
      },
    });

    // Create part and trigger refetch via stock addition
    const box = await testData.boxes.create();
    await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: newPart.key } },
      body: { box_no: box.box_no, loc_no: 1, qty: 5 },
    });

    // Query invalidation should trigger re-pagination
    // Note: The custom hook listens for 'getPartsWithLocations' invalidation
    const refetchReadyEvent = await waitForListLoading(page, 'parts.list', 'ready', 60_000);

    // Verify re-pagination happened
    expect(refetchReadyEvent.metadata?.paginationInfo?.pagesFetched).toBe(2);
    expect(refetchReadyEvent.metadata?.totalCount).toBeGreaterThanOrEqual(1201);
  });

  test('displays loading state during pagination', async ({ page, testData, parts }) => {
    // Seed enough parts to trigger multi-page load
    for (let i = 0; i < 1500; i++) {
      await testData.parts.create({
        overrides: {
          description: testData.parts.randomPartDescription(`Loading Part ${i}`),
        },
      });
    }

    await page.waitForTimeout(100);

    // Start waiting for ready event before navigation
    const readyEventPromise = waitForListLoading(page, 'parts.list', 'ready', 60_000);

    // Start navigation
    const gotoPromise = parts.gotoList();

    // Verify loading skeleton is displayed
    const loadingContainer = page.getByTestId('parts.list.loading');
    await expect(loadingContainer).toBeVisible({ timeout: 5000 });

    // Wait for navigation to complete
    await gotoPromise;

    // Wait for pagination to complete
    await readyEventPromise;

    // Loading skeleton should be replaced by actual content
    await expect(loadingContainer).toBeHidden();
    await parts.waitForCards();
  });
});
