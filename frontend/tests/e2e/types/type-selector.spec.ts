import type { Route } from '@playwright/test';
import { test, expect } from '../../support/fixtures';

const analyzeEndpoint = '**/api/ai-parts/analyze';

async function fulfillJson(route: Route, payload: unknown, status = 200) {
  await route.fulfill({
    status,
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
}

test.describe('TypeSelector - Part form integration', () => {
  test('supports inline creation of a new type when creating a part', async ({ page, testData }) => {
    const newTypeName = testData.types.randomTypeName('InlineType');

    await page.goto('/parts/new');

    const typeInput = page.getByPlaceholder('Search or create type...');
    await expect(typeInput).toBeVisible();

    await typeInput.fill(newTypeName);
    await page.getByRole('button', { name: new RegExp(`Create type "${newTypeName}"`, 'i') }).click();

    const dialog = page.getByRole('dialog', { name: 'Create New Type' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toBeHidden();

    await expect(typeInput).toHaveValue(newTypeName);

    const createdType = await testData.types.findByName(newTypeName);
    expect(createdType.name).toBe(newTypeName);
  });

  test('allows switching types when editing an existing part', async ({ page, testData }) => {
    const primaryType = await testData.types.create({ name: testData.types.randomTypeName('Primary') });
    const alternateType = await testData.types.create({ name: testData.types.randomTypeName('Alternate') });
    const { part } = await testData.parts.create({ typeId: primaryType.id });

    await page.goto(`/parts/${part.key}`);
    await page.getByRole('button', { name: /edit part/i }).click();

    const typeInput = page.getByPlaceholder('Search or create type...');
    await expect(typeInput).toHaveValue(primaryType.name);

    await typeInput.click();
    await typeInput.fill('');
    await typeInput.type(alternateType.name);
    const option = page.getByRole('option', { name: new RegExp(alternateType.name, 'i') });
    await expect(option).toBeVisible({ timeout: 15000 });
    await option.click();
    await expect(typeInput).toHaveValue(alternateType.name);

    await page.getByTestId('parts.form.submit').click();
    await expect(page.getByRole('button', { name: /edit part/i })).toBeVisible();

    await expect(page.getByText(alternateType.name)).toBeVisible();
    await expect(page.getByText(primaryType.name)).toHaveCount(0);
  });
});

test.describe('TypeSelector - AI review flow', () => {
  test('reuses options and supports inline creation during AI review', async ({
    page,
    testData,
    sseMocker,
  }) => {
    const existingType = await testData.types.create({ name: testData.types.randomTypeName('AIExisting') });
    const alternateType = await testData.types.create({ name: testData.types.randomTypeName('AIFallback') });
    const newTypeName = testData.types.randomTypeName('AINew');
    const streamPath = '/api/testing/ai-mock-stream';

    await page.route(analyzeEndpoint, route => fulfillJson(route, {
      task_id: 'mock-task',
      stream_url: streamPath,
    }), { times: 1 });

    try {
      await page.goto('/parts');

      await page.getByRole('button', { name: /add with ai/i }).click();

      const input = page.getByLabel('Part Number or Description');
      await input.fill('AI powered component');
      await page.getByRole('button', { name: /analyze part/i }).click();

      await page.waitForFunction(() => {
        const globalAny = window as unknown as Record<string, any>;
        const connections = globalAny.__sseConnections;
        if (!Array.isArray(connections)) {
          return false;
        }
        return connections.some((connection: any) => connection.readyState === 1);
      }, { timeout: 10000 });

      await sseMocker.sendEvent(/ai-mock-stream/, {
        event: 'task_event',
        data: {
          event_type: 'task_started',
          task_id: 'mock-task',
          timestamp: new Date().toISOString(),
          data: null,
        },
      });

      await sseMocker.sendEvent(/ai-mock-stream/, {
        event: 'task_event',
        data: {
          event_type: 'task_completed',
          data: {
            success: true,
            analysis: {
              description: 'AI generated part',
              manufacturer: 'Acme AI',
              manufacturer_code: 'AI-001',
              type: existingType.name,
              type_is_existing: true,
              existing_type_id: existingType.id,
              tags: ['ai', 'suggested'],
              documents: [],
              dimensions: null,
              voltage_rating: null,
              mounting_type: null,
              package: null,
              pin_count: null,
              pin_pitch: null,
              series: null,
              input_voltage: null,
              output_voltage: null,
              product_page: null,
              seller_link: null,
            },
            error_message: null,
          },
        },
      });

      await page.waitForFunction(() => {
        const globalAny = window as unknown as Record<string, any>;
        const connections = globalAny.__sseConnections;
        if (!Array.isArray(connections)) {
          return false;
        }
        return connections.some((connection: any) => {
          const events = connection.events as Array<{ type: string; data?: string }> | undefined;
          if (!Array.isArray(events)) {
            return false;
          }
          return events.some(event => {
            if (event.type !== 'task_event') {
              return false;
            }
            try {
              const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
              return payload?.event_type === 'task_completed';
            } catch {
              return false;
            }
          });
        });
      }, { timeout: 10000 });

      await expect(page.getByRole('heading', { name: 'Review & Edit Part Details' })).toBeVisible();

      const typeInput = page.getByPlaceholder('Search or create type...');
      await expect(typeInput).toHaveValue(existingType.name);

      await typeInput.click();
      await typeInput.fill('');
      await typeInput.type(alternateType.name);
      const alternateOption = page.getByRole('option', { name: new RegExp(alternateType.name, 'i') });
      await expect(alternateOption).toBeVisible({ timeout: 15000 });
      await alternateOption.click();
      await expect(typeInput).toHaveValue(alternateType.name);

      await typeInput.fill(newTypeName);
      await page.getByRole('button', { name: new RegExp(`Create type "${newTypeName}"`, 'i') }).click();

      const dialog = page.getByRole('dialog', { name: 'Create New Type' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Create' }).click();
      await expect(dialog).toBeHidden();

      await expect(typeInput).toHaveValue(newTypeName);

      const createdType = await testData.types.findByName(newTypeName);
      expect(createdType.name).toBe(newTypeName);

      await page.keyboard.press('Escape');
    } finally {
      await page.unroute(analyzeEndpoint);
    }
  });
});
