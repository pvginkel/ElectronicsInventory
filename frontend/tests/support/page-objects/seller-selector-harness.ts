import { expect, Locator, Page } from '@playwright/test'
import { waitForListLoading } from '../helpers'

export class SellerSelectorHarness {
  private readonly rootLocator: Locator

  constructor(private readonly page: Page, root?: Locator) {
    this.rootLocator = root ?? page.getByTestId('sellers.selector')
  }

  get root(): Locator {
    return this.rootLocator
  }

  get input(): Locator {
    return this.root.locator('[data-testid="sellers.selector.input"]')
  }

  get selected(): Locator {
    return this.root.locator('[data-testid="sellers.selector.selected"]')
  }

  async waitForReady(): Promise<void> {
    await waitForListLoading(this.page, 'sellers.selector', 'ready')
  }

  async search(term: string): Promise<void> {
    await this.input.fill(term)
  }

  async selectOption(name: string | RegExp): Promise<void> {
    await expect(this.root).toBeVisible()
    const option = this.page.getByRole('option', { name })
    await option.click()
  }

  async expectSelected(name: string | RegExp): Promise<void> {
    await expect(this.input).toHaveValue(name)
  }

  async triggerInlineCreate(term: string): Promise<void> {
    await this.search(term)
    const createButton = this.page.getByRole('button', { name: new RegExp(`create seller "${term}"`, 'i') })
    await createButton.click()
    await expect(this.inlineCreateDialog).toBeVisible()
  }

  get inlineCreateDialog(): Locator {
    return this.page.getByTestId('sellers.selector.create.dialog')
  }

  async fillInlineCreate(values: { name?: string; website?: string }): Promise<void> {
    if (values.name !== undefined) {
      await this.page.getByTestId('sellers.selector.create.field.name').fill(values.name)
    }
    if (values.website !== undefined) {
      await this.page.getByTestId('sellers.selector.create.field.website').fill(values.website)
    }
  }

  async submitInlineCreate(): Promise<void> {
    await this.page.getByTestId('sellers.selector.create.submit').click()
  }
}
