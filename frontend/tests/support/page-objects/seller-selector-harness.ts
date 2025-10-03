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
    const listboxId = await this.input.getAttribute('aria-controls')
    const listbox = listboxId
      ? this.page.locator(`[id="${listboxId}"]`)
      : this.page.locator('[role="listbox"]').filter({ has: this.page.getByRole('option', { name }) }).first()

    await expect(listbox).toBeVisible()

    await listbox.evaluate((node, matcher) => {
      const options = Array.from(node.querySelectorAll('[role="option"]')) as HTMLElement[]
      const target = options.find(option => {
        const text = option.textContent ?? ''
        if (matcher.regex) {
          const regex = new RegExp(matcher.regex.source, matcher.regex.flags)
          return regex.test(text)
        }
        return matcher.text ? text.includes(matcher.text) : false
      })

      if (target) {
        target.scrollIntoView({ block: 'nearest' })
      }
    }, {
      text: typeof name === 'string' ? name : undefined,
      regex: name instanceof RegExp ? { source: name.source, flags: name.flags } : undefined,
    })

    const option = listbox.getByRole('option', { name })
    await expect(option).toBeVisible()
    await expect(async () => {
      const isInView = await option.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const withinHorizontalBounds = rect.right > 0 && rect.left < window.innerWidth
        const withinVerticalBounds = rect.bottom > 0 && rect.top < window.innerHeight
        return withinHorizontalBounds && withinVerticalBounds
      })
      expect(isInView).toBe(true)
    }).toPass()
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
