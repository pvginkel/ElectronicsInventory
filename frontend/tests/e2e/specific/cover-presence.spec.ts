import { test, expect } from '../../support/fixtures';

const pngPlaceholder = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottgAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('Cover presence flag', () => {
  test('skips cover fetch when flag is false and loads when true', async ({ page }) => {
    const partWithCoverKey = 'ABCD';
    const partWithoutCoverKey = 'EFGH';

    const partsResponse = [
      {
        created_at: new Date().toISOString(),
        description: 'Amplifier With Cover',
        dimensions: null,
        has_cover_attachment: true,
        input_voltage: null,
        key: partWithCoverKey,
        locations: [],
        manufacturer: null,
        manufacturer_code: null,
        mounting_type: null,
        output_voltage: null,
        package: null,
        pin_count: null,
        pin_pitch: null,
        product_page: null,
        seller: null,
        seller_link: null,
        series: null,
        tags: [],
        total_quantity: 0,
        type_id: null,
        updated_at: new Date().toISOString(),
        voltage_rating: null,
      },
      {
        created_at: new Date().toISOString(),
        description: 'Sensor Without Cover',
        dimensions: null,
        has_cover_attachment: false,
        input_voltage: null,
        key: partWithoutCoverKey,
        locations: [],
        manufacturer: null,
        manufacturer_code: null,
        mounting_type: null,
        output_voltage: null,
        package: null,
        pin_count: null,
        pin_pitch: null,
        product_page: null,
        seller: null,
        seller_link: null,
        series: null,
        tags: [],
        total_quantity: 0,
        type_id: null,
        updated_at: new Date().toISOString(),
        voltage_rating: null,
      },
    ];

    await page.route('**/api/types?include_stats=true', route =>
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([]),
      })
    );

    await page.route('**/api/parts/with-locations**', route =>
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(partsResponse),
      })
    );

    const coverRequests: Record<string, number> = {};

    await page.route(/\/api\/parts\/([^/]+)\/cover$/, async route => {
      const match = route.request().url().match(/\/api\/parts\/([^/]+)\/cover$/);
      const partKey = match?.[1];
      if (partKey) {
        coverRequests[partKey] = (coverRequests[partKey] ?? 0) + 1;
      }

      if (partKey === partWithCoverKey) {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            attachment: {
              id: 101,
              title: 'Mock Cover',
              attachment_type: 'image',
              filename: 'cover.png',
              content_type: 'image/png',
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 404,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ detail: 'Not Found' }),
        });
      }
    });

    await page.route(/\/api\/parts\/([^/]+)\/cover\/thumbnail/, async route => {
      const match = route.request().url().match(/\/api\/parts\/([^/]+)\/cover\//);
      const partKey = match?.[1];

      if (partKey === partWithCoverKey) {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'image/png' },
          body: pngPlaceholder,
        });
      } else {
        await route.fulfill({ status: 404 });
      }
    });

    await page.goto('/parts');

    await expect(page.getByRole('heading', { name: 'Parts' })).toBeVisible();
    await expect(page.getByText('Amplifier With Cover')).toBeVisible();
    await expect(page.getByText('Sensor Without Cover')).toBeVisible();

    await expect(page.getByText('No cover image')).toBeVisible();
    await expect(page.locator('img[alt="Mock Cover"]')).toBeVisible();

    await expect.poll(() => coverRequests[partWithCoverKey] ?? 0).toBe(1);
    expect(coverRequests[partWithoutCoverKey]).toBeUndefined();
  });
});
