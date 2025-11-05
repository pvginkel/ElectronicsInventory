import { expect, Locator, Page } from '@playwright/test'
import { BasePage } from './base-page'
import { waitForListLoading } from '../helpers'

export class BoxesPage extends BasePage {
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
    this.root = page.getByTestId('boxes.overview')
    this.header = page.getByTestId('boxes.overview.header')
    this.content = page.getByTestId('boxes.overview.content')
    this.addButton = page.getByTestId('boxes.list.add')
    this.searchInput = page.getByTestId('boxes.list.search.input')
    this.searchClear = page.getByTestId('boxes.list.search.clear')
    this.summary = page.getByTestId('boxes.overview.summary')
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
    // Boxes uses client-side filtering, so just wait for URL to contain search param (debounce completion)
    await this.searchInput.fill(term);
    await this.page.waitForURL(/[?&]search=/);
  }

  async clearSearch(): Promise<void> {
    if (await this.searchClear.isVisible()) {
      await this.searchClear.click();
    } else {
      await this.searchInput.fill('');
    }
    // Wait for debounce to complete and search param to be removed from URL
    await this.page.waitForURL(url => !url.toString().includes('search='), { timeout: 10000 });
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
    await expect(this.detailLayout).toBeVisible()
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

  get detailLayout(): Locator {
    return this.page.getByTestId('boxes.detail.layout')
  }

  get detailHeader(): Locator {
    return this.page.getByTestId('boxes.detail.header')
  }

  get detailContent(): Locator {
    return this.page.getByTestId('boxes.detail.content')
  }

  get detailActions(): Locator {
    return this.page.getByTestId('boxes.detail.actions')
  }

  get detailSummary(): Locator {
    return this.page.getByTestId('boxes.detail.summary')
  }

  get detailLocations(): Locator {
    return this.page.getByTestId('boxes.detail.locations')
  }

  get detailEditButton(): Locator {
    return this.page.getByTestId('boxes.detail.actions.edit')
  }

  get detailDeleteButton(): Locator {
    return this.page.getByTestId('boxes.detail.actions.delete')
  }

  get detailBreadcrumb(): Locator {
    return this.detailHeader.getByRole('link', { name: /storage boxes/i })
  }

  async getDetailHeaderRect(): Promise<{ top: number; bottom: number; height: number }> {
    return this.detailHeader.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, height: rect.height }
    })
  }

  async getDetailActionsRect(): Promise<{ top: number; bottom: number; height: number }> {
    return this.detailActions.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, height: rect.height }
    })
  }

  async scrollDetailContent(target: number | 'bottom' = 'bottom'): Promise<void> {
    await this.detailContent.evaluate((element, value) => {
      if (value === 'bottom') {
        element.scrollTo({ top: element.scrollHeight })
        return
      }
      element.scrollTo({ top: value })
    }, target)
  }

  async detailContentScrollTop(): Promise<number> {
    return this.detailContent.evaluate((element) => element.scrollTop)
  }

  async returnToListFromDetail(): Promise<void> {
    await this.detailBreadcrumb.click()
    await expect(this.root).toBeVisible()
  }

  locationContainer(boxNo: number, locNo: number): Locator {
    return this.page.getByTestId(`boxes.detail.location-container.${boxNo}-${locNo}`)
  }

  partCard(partKey: string): Locator {
    return this.page.getByTestId(`boxes.detail.part-card.${partKey}`)
  }

  get detailSearch(): Locator {
    return this.page.getByTestId('boxes.detail.search')
  }

  async searchParts(term: string): Promise<void> {
    await this.detailSearch.fill(term)
    // Wait for the search filtering event that indicates filtering is complete
    await waitForListLoading(this.page, 'boxes.detail.search', 'filtered')
  }

  async clearPartSearch(): Promise<void> {
    await this.detailSearch.fill('')
    // Wait for the search cleared event
    await waitForListLoading(this.page, 'boxes.detail.search', 'cleared')
  }

  async expectLocationOccupied(boxNo: number, locNo: number, options: { partKey?: string; quantity?: number }): Promise<void> {
    const container = this.locationContainer(boxNo, locNo)
    await expect(container).toBeVisible()

    if (options.partKey) {
      const card = container.getByTestId(`boxes.detail.part-card.${options.partKey}`)
      await expect(card).toBeVisible()

      if (options.quantity !== undefined) {
        const quantityBadge = card.getByTestId(`boxes.detail.part-card.quantity-${options.partKey}`)
        await expect(quantityBadge).toContainText(`${options.quantity}`)
      }
    }
  }

  async expectLocationEmpty(boxNo: number, locNo: number): Promise<void> {
    const container = this.locationContainer(boxNo, locNo)
    // Empty locations are not rendered in the new layout
    await expect(container).not.toBeVisible()
  }

  async expectPartCardVisible(partKey: string): Promise<void> {
    await expect(this.partCard(partKey)).toBeVisible()
  }

  async expectPartCardNotVisible(partKey: string): Promise<void> {
    await expect(this.partCard(partKey)).not.toBeVisible()
  }

  async clickPartCard(partKey: string): Promise<void> {
    await this.partCard(partKey).click()
  }

  async getLocationPartCount(boxNo: number, locNo: number): Promise<number> {
    const container = this.locationContainer(boxNo, locNo)
    const count = await container.getAttribute('data-part-count')
    return count ? parseInt(count, 10) : 0
  }
}
