import { expect, Locator, Page } from '@playwright/test'
import { BasePage } from './base-page'
import { waitForListLoading } from '../helpers'

export class SellersPage extends BasePage {
  readonly root: Locator
  readonly header: Locator
  readonly content: Locator
  readonly addButton: Locator
  readonly searchInput: Locator
  readonly searchClear: Locator
  readonly summary: Locator
  readonly listTable: Locator

  constructor(page: Page) {
    super(page)
    this.root = page.getByTestId('sellers.overview')
    this.header = page.getByTestId('sellers.overview.header')
    this.content = page.getByTestId('sellers.overview.content')
    this.addButton = page.getByTestId('sellers.list.add')
    this.searchInput = page.getByTestId('sellers.list.search')
    this.searchClear = page.getByTestId('sellers.list.search.clear')
    this.summary = page.getByTestId('sellers.overview.summary')
    this.listTable = page.getByTestId('sellers.list.table')
  }

  async gotoList(searchParams?: { search?: string }): Promise<void> {
    const search = searchParams?.search ? `?search=${encodeURIComponent(searchParams.search)}` : ''
    await this.goto(`/sellers${search}`)
    await this.waitForListState('ready')
    await expect(this.root).toBeVisible()
  }

  async waitForListState(phase: 'loading' | 'ready' | 'error' | 'aborted'): Promise<void> {
    await waitForListLoading(this.page, 'sellers.list', phase)
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

  async scrollContent(distance: number): Promise<void> {
    await this.content.evaluate((element, value) => {
      element.scrollTop = value
    }, distance)
  }

  async scrollContentBy(delta: number): Promise<void> {
    await this.content.evaluate((element, value) => {
      element.scrollTop += value
    }, delta)
  }

  sellerCard(id: number): Locator {
    return this.page.getByTestId(`sellers.list.item.${id}`)
  }

  async expectCardVisible(id: number): Promise<void> {
    await expect(this.sellerCard(id)).toBeVisible()
  }

  async openCreateForm(): Promise<void> {
    await this.addButton.click()
    await expect(this.formDialog('sellers.create')).toBeVisible()
  }

  async openEditForm(id: number): Promise<void> {
    const card = this.sellerCard(id)
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: /edit/i }).click()
    await expect(this.formDialog(`sellers.edit.${id}`)).toBeVisible()
  }

  async deleteFromList(id: number): Promise<void> {
    const card = this.sellerCard(id)
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: /delete/i }).click()
    const dialog = this.page.getByRole('dialog', { name: /delete seller/i })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /delete/i }).click()
  }

  async fillSellerForm(formId: string, values: { name?: string; website?: string }): Promise<void> {
    const formRoot = this.formDialog(formId)
    if (values.name !== undefined) {
      await formRoot.getByTestId(`${formId}.field.name`).fill(values.name)
    }
    if (values.website !== undefined) {
      await formRoot.getByTestId(`${formId}.field.website`).fill(values.website)
    }
  }

  async submitSellerForm(formId: string): Promise<void> {
    const formRoot = this.formDialog(formId)
    await formRoot.getByTestId(`${formId}.submit`).click()
  }

  formDialog(formId: string): Locator {
    return this.page.getByTestId(`${formId}.dialog`)
  }

  sellerLink(id: number): Locator {
    return this.page.getByTestId(`sellers.list.item.${id}.link`)
  }
}
