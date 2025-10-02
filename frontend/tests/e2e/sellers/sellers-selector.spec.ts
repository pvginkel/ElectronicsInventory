import { test, expect } from '../../support/fixtures'
import { SellerSelectorHarness } from '../../support/page-objects/seller-selector-harness'

test.describe('Seller Selector Integration', () => {
  test('selects an existing seller and persists after part creation', async ({ parts, testData }) => {
    const type = await testData.types.create({ name: `Selector Type ${Date.now()}` })
    const seller = await testData.sellers.create({ overrides: { name: `Existing Seller ${Date.now()}`, website: `https://existing-${Date.now()}.example.com` } })

    await parts.gotoList()
    await parts.openNewPartForm()

    const selector = new SellerSelectorHarness(parts.playwrightPage)
    await selector.waitForReady()
    await selector.search(seller.name)
    await selector.selectOption(seller.name)
    await selector.expectSelected(seller.name)

    await parts.formDescription.fill(`Part with Seller ${Date.now()}`)
    await parts.formManufacturerCode.fill(`PS-${Date.now()}`)
    await parts.selectType(type.name)

    await parts.formSubmit.click()
    await expect(parts.detailRoot).toBeVisible({ timeout: 15000 })
    await expect(parts.detailRoot).toContainText(seller.name)
  })

test('creates a seller inline and preserves selection through part lifecycle', async ({ parts, sellers, testData, toastHelper }) => {
    const type = await testData.types.create({ name: `Inline Type ${Date.now()}` })

    await parts.gotoList()
    await parts.openNewPartForm()

    const selector = new SellerSelectorHarness(parts.playwrightPage)
    await selector.waitForReady()

    const inlineSellerName = `Inline Seller ${Date.now()}`
    const inlineWebsite = `https://inline-${Date.now()}.example.com`

    await selector.triggerInlineCreate(inlineSellerName)
    await selector.fillInlineCreate({ name: inlineSellerName, website: inlineWebsite })
    await selector.submitInlineCreate()
    await toastHelper.expectSuccessToast(/seller created successfully/i)
    await selector.expectSelected(inlineSellerName)

    await parts.formDescription.fill(`Inline Part ${Date.now()}`)
    await parts.formManufacturerCode.fill(`IP-${Date.now()}`)
    await parts.selectType(type.name)

    await parts.formSubmit.click()
    await expect(parts.detailRoot).toBeVisible({ timeout: 15000 })
    await expect(parts.detailRoot).toContainText(inlineSellerName)

    await parts.editPartButton.click()
    await expect(parts.formRoot).toBeVisible()
    const editSelector = new SellerSelectorHarness(parts.playwrightPage)
    await editSelector.expectSelected(inlineSellerName)

    await parts.formCancel.click()

    await sellers.gotoList({ search: inlineSellerName })
    await expect(sellers.listTable).toBeVisible({ timeout: 15000 })
    await expect(sellers.listTable).toContainText(inlineSellerName)
    await toastHelper.dismissToast({ all: true })
  })
})
