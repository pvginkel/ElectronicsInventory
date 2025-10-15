import { expect, Locator, Page } from '@playwright/test'
import { BasePage } from './base-page'
import { waitForListLoading } from '../helpers'

export class BoxesPage extends BasePage {
  readonly root: Locator
  readonly header: Locator
  readonly addButton: Locator
  readonly searchInput: Locator
  readonly searchClear: Locator
  readonly summary: Locator
  readonly listTable: Locator

  constructor(page: Page) {
    super(page)
    this.root = page.getByTestId('boxes.page')
    this.header = page.getByTestId('boxes.page.header')
    this.addButton = page.getByTestId('boxes.list.add')
    this.searchInput = page.getByTestId('boxes.list.search')
    this.searchClear = page.getByTestId('boxes.list.search.clear')
    this.summary = page.getByTestId('boxes.list.summary')
    this.listTable = page.getByTestId('boxes.list.table')
  }

  async gotoList(searchParams?: { search?: string }): Promise<void> {
    const search = searchParams?.search ? `?search=${encodeURIComponent(searchParams.search)}` : ''
    await this.goto(`/boxes${search}`)
    await this.waitForListState('ready')
    await expect(this.root).toBeVisible()
  }

  async waitForListState(phase: 'loading' | 'ready' | 'error' | 'aborted'): Promise<void> {
    await waitForListLoading(this.page, 'boxes.list', phase)
  }

  async search(term: string): Promise<void> {
    await this.searchInput.fill(term)
  }

  async clearSearch(): Promise<void> {
    if (await this.searchClear.isVisible()) {
      await this.searchClear.click()
    } else {
      await this.searchInput.fill('')
    }
  }

  boxCard(boxNo: number): Locator {
    return this.page.getByTestId(`boxes.list.item.${boxNo}`)
  }

  async expectCardVisible(boxNo: number): Promise<void> {
    await expect(this.boxCard(boxNo)).toBeVisible()
  }

  async openCreateForm(): Promise<void> {
    await this.addButton.click()
    await expect(this.formDialog('boxes.create')).toBeVisible()
  }

  async openEditForm(boxNo: number): Promise<void> {
    const card = this.boxCard(boxNo)
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: /edit/i }).click()
    await expect(this.formDialog(`boxes.edit.${boxNo}`)).toBeVisible()
  }

  async openDetail(boxNo: number): Promise<void> {
    const card = this.boxCard(boxNo)
    await expect(card).toBeVisible()
    await card.click()
    await waitForListLoading(this.page, 'boxes.detail', 'ready')
    await expect(this.detailRoot).toBeVisible()
  }

  async fillBoxForm(formId: string, values: { description?: string; capacity?: number }): Promise<void> {
    const formRoot = this.formDialog(formId)
    if (values.description !== undefined) {
      await formRoot.getByTestId(`${formId}.field.description`).fill(values.description)
    }
    if (values.capacity !== undefined) {
      await formRoot.getByTestId(`${formId}.field.capacity`).fill(String(values.capacity))
    }
  }

  async submitBoxForm(formId: string): Promise<void> {
    const formRoot = this.formDialog(formId)
    await formRoot.getByTestId(`${formId}.submit`).click()
  }

  formDialog(formId: string): Locator {
    return this.page.getByTestId(`${formId}.dialog`)
  }

  // Detail helpers
  get detailRoot(): Locator {
    return this.page.getByTestId('boxes.detail')
  }

  get detailSummary(): Locator {
    return this.page.getByTestId('boxes.detail.summary')
  }

  get detailLocations(): Locator {
    return this.page.getByTestId('boxes.detail.locations')
  }

  get detailEditButton(): Locator {
    return this.detailRoot.getByRole('button', { name: /edit box/i })
  }

  get detailDeleteButton(): Locator {
    return this.detailRoot.getByRole('button', { name: /delete box/i })
  }

  get detailBreadcrumb(): Locator {
    return this.page.getByTestId('boxes.detail.header').getByRole('link', { name: /storage boxes/i })
  }

  async returnToListFromDetail(): Promise<void> {
    await this.detailBreadcrumb.click()
    await expect(this.root).toBeVisible()
  }

  locationItem(boxNo: number, locNo: number): Locator {
    return this.page.getByTestId(`boxes.detail.locations.item.${boxNo}-${locNo}`)
  }

  async expectLocationOccupied(boxNo: number, locNo: number, options: { partKey?: string; quantity?: number }): Promise<void> {
    const item = this.locationItem(boxNo, locNo)
    await expect(item).toBeVisible()
    await expect(item).toHaveAttribute('data-is-occupied', 'true')
    if (options.partKey) {
      await expect(item).toHaveAttribute('data-primary-part-key', options.partKey)
    }
    if (options.quantity !== undefined) {
      await expect(item).toContainText(`Qty: ${options.quantity}`)
    }
  }

  async expectLocationEmpty(boxNo: number, locNo: number): Promise<void> {
    const item = this.locationItem(boxNo, locNo)
    await expect(item).toBeVisible()
    await expect(item).toHaveAttribute('data-is-occupied', 'false')
    await expect(item).toContainText('Empty')
  }
}
