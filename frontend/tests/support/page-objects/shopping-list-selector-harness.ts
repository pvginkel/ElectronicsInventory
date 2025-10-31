import { expect, Locator, Page } from '@playwright/test';
import { waitForListLoading } from '../helpers';

interface ShoppingListSelectorHarnessOptions {
  root?: Locator;
  input?: Locator;
  scope?: string;
}

export class ShoppingListSelectorHarness {
  private readonly rootLocator: Locator;
  private readonly inputLocator: Locator;
  private readonly scope: string;

  constructor(private readonly page: Page, options: ShoppingListSelectorHarnessOptions = {}) {
    this.rootLocator = options.root ?? page.getByTestId('shopping-lists.selector');
    this.inputLocator = options.input ?? this.rootLocator.locator('input');
    this.scope = options.scope ?? 'parts.orderStock.lists';
  }

  get root(): Locator {
    return this.rootLocator;
  }

  get input(): Locator {
    return this.inputLocator;
  }

  async waitForReady(): Promise<void> {
    await waitForListLoading(this.page, this.scope, 'ready');
  }

  async search(term: string): Promise<void> {
    await this.input.fill(term);
  }

  async selectOption(name: string | RegExp): Promise<void> {
    await expect(this.root).toBeVisible();
    await this.input.click();

    const listboxId = await this.input.getAttribute('aria-controls');
    const listbox = listboxId
      ? this.page.locator(`[id="${listboxId}"]`)
      : this.page.locator('[role="listbox"]').filter({ has: this.page.getByRole('option', { name }) }).first();

    await expect(listbox).toBeVisible();

    await listbox.evaluate((node, matcher) => {
      const options = Array.from(node.querySelectorAll('[role="option"]')) as HTMLElement[];
      const target = options.find(option => {
        const text = option.textContent ?? '';
        if (matcher.regex) {
          const regex = new RegExp(matcher.regex.source, matcher.regex.flags);
          return regex.test(text);
        }
        return matcher.text ? text.includes(matcher.text) : false;
      });

      if (target) {
        target.scrollIntoView({ block: 'nearest' });
      }
    }, {
      text: typeof name === 'string' ? name : undefined,
      regex: name instanceof RegExp ? { source: name.source, flags: name.flags } : undefined,
    });

    const option = listbox.getByRole('option', { name });
    await expect(option).toBeVisible();
    await expect(async () => {
      const isInView = await option.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const withinHorizontalBounds = rect.right > 0 && rect.left < window.innerWidth;
        const withinVerticalBounds = rect.bottom > 0 && rect.top < window.innerHeight;
        return withinHorizontalBounds && withinVerticalBounds;
      });
      expect(isInView).toBe(true);
    }).toPass();

    await option.click();
  }

  async expectSelected(name: string | RegExp): Promise<void> {
    await expect(this.input).toHaveValue(name);
  }

  async triggerInlineCreate(term: string): Promise<void> {
    await this.search(term);
    const createButton = this.page.getByRole('button', { name: new RegExp(`create list "${term}"`, 'i') });
    await createButton.click();
    await expect(this.inlineCreateDialog).toBeVisible();
  }

  get inlineCreateDialog(): Locator {
    return this.page.getByTestId('ShoppingListCreate:concept.dialog');
  }

  async fillInlineCreate(values: { name?: string; description?: string }): Promise<void> {
    if (values.name !== undefined) {
      await this.page.getByTestId('ShoppingListCreate:concept.field.name').fill(values.name);
    }
    if (values.description !== undefined) {
      await this.page.getByTestId('ShoppingListCreate:concept.field.description').fill(values.description);
    }
  }

  async submitInlineCreate(): Promise<void> {
    await this.page.getByTestId('ShoppingListCreate:concept.submit').click();
  }
}
