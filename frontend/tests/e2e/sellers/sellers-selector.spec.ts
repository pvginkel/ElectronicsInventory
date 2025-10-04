import { test, expect } from '../../support/fixtures'
import { makeUnique, makeUniqueToken } from '../../support/helpers'
import { SellerSelectorHarness } from '../../support/page-objects/seller-selector-harness'

test.describe('Seller Selector Integration', () => {
  test('selects an existing seller and persists after part creation', async ({ parts, testData }) => {
    const type = await testData.types.create({ name: makeUnique('Selector Type') })
    const sellerName = makeUnique('Existing Seller')
    const seller = await testData.sellers.create({ overrides: { name: sellerName, website: `https://existing-${makeUniqueToken(8)}.example.com` } })

    await parts.gotoList()
    await parts.openNewPartForm()

    const selector = new SellerSelectorHarness(parts.playwrightPage)
    await selector.waitForReady()
    await selector.search(seller.name)
    await selector.selectOption(seller.name)
    await selector.expectSelected(seller.name)

    await parts.formDescription.fill(makeUnique('Part with Seller'))
    await parts.formManufacturerCode.fill(`PS-${makeUniqueToken(4).toUpperCase()}`)
    await parts.selectType(type.name)

    await parts.formSubmit.click()
    await expect(parts.detailRoot).toBeVisible({ timeout: 15000 })
    await expect(parts.detailRoot).toContainText(seller.name)
  })

test('creates a seller inline and preserves selection through part lifecycle', async ({ parts, sellers, testData, toastHelper }) => {
    const type = await testData.types.create({ name: makeUnique('Inline Type') })

    await parts.gotoList()
    await parts.openNewPartForm()

    const selector = new SellerSelectorHarness(parts.playwrightPage)
    await selector.waitForReady()

    const inlineSellerName = makeUnique('Inline Seller')
    const inlineWebsite = `https://inline-${makeUniqueToken(8)}.example.com`

    await selector.triggerInlineCreate(inlineSellerName)
    await selector.fillInlineCreate({ name: inlineSellerName, website: inlineWebsite })
    await selector.submitInlineCreate()
    await toastHelper.expectSuccessToast(/seller created successfully/i)
    await selector.expectSelected(inlineSellerName)

    await parts.formDescription.fill(makeUnique('Inline Part'))
    await parts.formManufacturerCode.fill(`IP-${makeUniqueToken(4).toUpperCase()}`)
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
