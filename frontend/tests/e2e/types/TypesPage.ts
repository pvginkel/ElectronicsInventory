import { expect, type Locator, type Page } from '@playwright/test';

export class TypesPage {
  readonly page: Page;
  readonly root: Locator;
  readonly createButton: Locator;
  readonly listContainer: Locator;
  readonly cards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('types.page');

    // Prefer exact text for stability, fallback to testid
    this.createButton = this.root.getByRole('button', { name: 'Add Type' })
      .or(this.root.getByTestId('types.create.button'));

    // TypeList uses cards, not table
    this.listContainer = this.root.getByTestId('types.list.container');
    this.cards = this.root.getByTestId('types.list.card');
  }

  async goto() {
    await this.page.goto('/types');  // baseURL configured in playwright.config.ts
    await expect(this.root).toBeVisible();
  }

  modal(): Locator {
    // Use testid directly to avoid ambiguity with multiple dialog elements
    return this.page.getByTestId('types.create.modal')
      .or(this.page.getByTestId('types.edit.modal'));
  }

  cardByName(name: string): Locator {
    return this.cards.filter({ hasText: name });
  }

  nameInput(): Locator {
    // Case-insensitive label match
    return this.page.getByLabel(/name/i)
      .or(this.page.getByTestId('types.form.name'));
  }

  submitButton(): Locator {
    // Use exact button text from TypeForm
    return this.modal().getByRole('button', { name: /add type|update type/i })
      .or(this.page.getByTestId('types.form.submit'));
  }

  toast(text?: string | RegExp): Locator {
    const toast = this.page.getByRole('status');
    return text ? toast.filter({ hasText: text }) : toast;
  }

  async createType(name: string) {
    await this.createButton.click();
    await expect(this.modal()).toBeVisible();
    await this.nameInput().fill(name);
    await this.submitButton().click();
    await expect(this.modal()).toBeHidden();
    await expect(this.cardByName(name)).toBeVisible();
  }
}