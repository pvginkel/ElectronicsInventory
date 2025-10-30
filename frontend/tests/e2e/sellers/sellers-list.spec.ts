import { test, expect } from '../../support/fixtures'
import { makeUnique, makeUniqueToken } from '../../support/helpers'

test.describe('Sellers - List Experience', () => {
  test('renders sellers and filters via search', async ({ sellers, testData }) => {
    const prefix = makeUnique('QA-Sellers')
    const primary = await testData.sellers.create({ overrides: { name: `${prefix} Primary`, website: `https://primary-${makeUniqueToken(8)}.example.com` } })
    const secondary = await testData.sellers.create({ overrides: { name: `${prefix} Secondary`, website: `https://secondary-${makeUniqueToken(8)}.example.com` } })
    await Promise.all(
      Array.from({ length: 4 }).map((_, index) =>
        testData.sellers.create({ overrides: { name: `${prefix} Overflow ${index}`, website: `https://overflow-${index}-${makeUniqueToken(6)}.example.com` } })
      )
    )

    await sellers.goto('/sellers')
    await expect(sellers.listTable).toBeVisible({ timeout: 15000 })
    await sellers.expectCardVisible(primary.id)
    await sellers.expectCardVisible(secondary.id)
    await expect(sellers.summary).toContainText(/\d+ sellers/i)

    const headerBefore = await sellers.header.boundingBox()
    expect(headerBefore).toBeTruthy()
    await sellers.scrollContentBy(600)
    await expect(sellers.header).toBeVisible()
    const headerAfter = await sellers.header.boundingBox()
    if (headerBefore && headerAfter) {
      expect(Math.abs(headerAfter.y - headerBefore.y)).toBeLessThan(1)
    }

    await sellers.search(`${prefix} Primary`)
    await expect(sellers.sellerCard(primary.id)).toBeVisible()
    await expect(sellers.sellerCard(secondary.id)).toBeHidden()
    await expect(sellers.summary).toContainText(/1 of \d+ sellers showing/i)
    await expect(sellers.playwrightPage.getByTestId('list-screen.counts.filtered')).toHaveText(/1 filtered/i)

    await sellers.clearSearch()
    await expect(sellers.sellerCard(primary.id)).toBeVisible()
    await expect(sellers.sellerCard(secondary.id)).toBeVisible()
    await expect(sellers.summary).toContainText(/\d+ sellers/i)
  })

  test('debounced search updates URL and filters sellers', async ({ page, sellers, testData }) => {
    const prefix = makeUnique('Search-Test')
    const distributorName = `${prefix} Distributor`
    const manufacturerName = `${prefix} Manufacturer`

    const distributor = await testData.sellers.create({
      overrides: { name: distributorName, website: `https://dist-${makeUniqueToken(8)}.example.com` }
    })
    await testData.sellers.create({
      overrides: { name: manufacturerName, website: `https://mfg-${makeUniqueToken(8)}.example.com` }
    })

    await sellers.gotoList()

    // Search for Distributor - page object waits for debounce + query completion
    await sellers.search('Distributor')

    // Verify URL updated with search parameter
    await expect(page).toHaveURL(/search=Distributor/i)

    // Verify filtered results
    await expect(sellers.sellerCard(distributor.id)).toBeVisible()
    await expect(sellers.summary).toContainText(/1 of \d+ sellers showing/i)

    // Clear should update URL immediately (bypass debounce)
    await sellers.clearSearch()
    await expect(page).toHaveURL(/^(?!.*search)/)
    await expect(sellers.summary).toContainText(/\d+ sellers/i)
  })

  test('creates, edits, and deletes a seller with instrumentation and toasts', async ({ sellers, testEvents, toastHelper }) => {
    const name = makeUnique('Playwright Seller')
    const website = `https://seller-${makeUniqueToken(8)}.example.com`

    await sellers.gotoList()
    await sellers.openCreateForm()
    await sellers.fillSellerForm('sellers.create', { name, website })
    await testEvents.clearEvents()

    const [createSubmit, createSuccess] = await Promise.all([
      testEvents.waitForEvent(event => event.kind === 'form' && event.formId === 'sellers.create' && event.phase === 'submit'),
      testEvents.waitForEvent(event => event.kind === 'form' && event.formId === 'sellers.create' && event.phase === 'success'),
      sellers.submitSellerForm('sellers.create')
    ])

    const createSubmitTs = new Date(createSubmit.timestamp).getTime()
    const createSuccessTs = new Date(createSuccess.timestamp).getTime()
    expect(createSuccessTs).toBeGreaterThan(createSubmitTs)
    await toastHelper.expectSuccessToast(/seller created successfully/i)
    await expect(sellers.listTable).toBeVisible({ timeout: 15000 })

    const createdCard = sellers.listTable.locator(`[data-testid^="sellers.list.item."]`, { hasText: name })
    await expect(createdCard).toBeVisible()
    const createdSellerIdAttr = await createdCard.getAttribute('data-seller-id')
    expect(createdSellerIdAttr).toBeTruthy()
    const createdSellerId = Number(createdSellerIdAttr)
    expect(Number.isFinite(createdSellerId)).toBeTruthy()

    const updatedName = `${name} Updated`
    const updatedWebsite = `https://seller-updated-${makeUniqueToken(8)}.example.com`
    await sellers.openEditForm(createdSellerId)
    await sellers.fillSellerForm(`sellers.edit.${createdSellerId}`, { name: updatedName, website: updatedWebsite })
    await testEvents.clearEvents()

    const [editSubmit, editSuccess] = await Promise.all([
      testEvents.waitForEvent(event => event.kind === 'form' && event.formId === `sellers.edit.${createdSellerId}` && event.phase === 'submit'),
      testEvents.waitForEvent(event => event.kind === 'form' && event.formId === `sellers.edit.${createdSellerId}` && event.phase === 'success'),
      sellers.submitSellerForm(`sellers.edit.${createdSellerId}`)
    ])

    const editSubmitTs = new Date(editSubmit.timestamp).getTime()
    const editSuccessTs = new Date(editSuccess.timestamp).getTime()
    expect(editSuccessTs).toBeGreaterThan(editSubmitTs)
    await toastHelper.expectSuccessToast(/seller updated successfully/i)
    await expect(sellers.listTable).toBeVisible({ timeout: 15000 })
    await expect(sellers.sellerCard(createdSellerId)).toContainText(updatedName)

    await sellers.deleteFromList(createdSellerId)
    await toastHelper.expectSuccessToast(new RegExp(`Seller "${updatedName}" deleted`, 'i'))
    await expect(sellers.listTable).toBeVisible({ timeout: 15000 })
    await expect(sellers.sellerCard(createdSellerId)).toBeHidden()
    await toastHelper.dismissToast({ all: true })
  })

  test('opens seller website in a new tab', async ({ sellers, testData }) => {
    const sellerName = makeUnique('Link Seller')
    const seller = await testData.sellers.create({ overrides: { name: sellerName, website: `https://link-${makeUniqueToken(8)}.example.com` } })

    await sellers.gotoList()
    await expect(sellers.listTable).toBeVisible({ timeout: 15000 })
    await sellers.search(seller.name)
    await expect(sellers.listTable).toBeVisible({ timeout: 15000 })

    await sellers.playwrightPage.evaluate(() => {
      const win = window as typeof window & { __lastOpenedUrl?: string | null }
      const original = win.open
      win.__lastOpenedUrl = null
      win.open = function (...args: Parameters<typeof original>) {
        const [url] = args
        win.__lastOpenedUrl = typeof url === 'string' ? url : url && typeof url.toString === 'function' ? url.toString() : null
        return original ? original.apply(window, args) : null
      }
    })
    const popupPromise = sellers.playwrightPage.waitForEvent('popup')
    await sellers.sellerLink(seller.id).click()
    const popup = await popupPromise
    await expect(popup).not.toBeNull()
    const openedUrl = await sellers.playwrightPage.evaluate(() => (window as typeof window & { __lastOpenedUrl?: string | null }).__lastOpenedUrl)
    expect(openedUrl).toBe(seller.website)
    await popup.close()

    await sellers.clearSearch()
  })
})
