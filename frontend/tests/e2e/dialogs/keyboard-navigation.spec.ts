import { test, expect } from '../../support/fixtures'
import { makeUnique, makeUniqueToken } from '../../support/helpers'
import { SellerSelectorHarness } from '../../support/page-objects/seller-selector-harness'

function deterministicImageUrl(baseUrl: string, text: string): string {
  const url = new URL('/api/testing/content/image', baseUrl);
  url.hostname = '127.0.0.1';
  url.searchParams.set('text', text);
  return url.toString();
}

test.describe('Dialog Keyboard Navigation', () => {
  test('ConfirmDialog click does not bubble to parent elements', async ({ parts, partsDocuments, testData, toastHelper, backendUrl }) => {
    // Create a part with a link document
    const { part } = await testData.parts.create({
      overrides: {
        description: makeUnique('Part with Document'),
      },
    })

    const documentUrl = deterministicImageUrl(backendUrl, 'Test Document')
    const attachment = await testData.attachments.createUrl(part.key, {
      url: documentUrl,
      title: 'Test Document',
    })

    // Navigate to part detail
    await parts.gotoList()
    await parts.waitForCards()
    await parts.openCardByKey(part.key)

    // Wait for document tile to be visible
    await partsDocuments.waitForAttachmentCount(1)
    const tile = partsDocuments.documentTileById(attachment.id)
    await expect(tile).toBeVisible()

    // Click delete button to open ConfirmDialog
    await tile.getByTitle('Delete').click()

    // Wait for dialog to appear and confirm deletion
    const dialog = parts.playwrightPage.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    const confirmButton = dialog.getByRole('button', { name: /delete/i })
    await expect(confirmButton).toBeVisible()

    // Capture URL before confirming to verify link doesn't open (event doesn't bubble)
    const urlBefore = parts.playwrightPage.url()
    await confirmButton.click()

    // Verify deletion succeeded
    await toastHelper.waitForToastWithText(/delete|removed|remove/i, { timeout: 10000 }).catch(() => undefined)
    await expect.poll(async () => (await testData.attachments.list(part.key)).length).toBe(0)

    // Verify URL hasn't changed (link wasn't opened due to event bubbling)
    expect(parts.playwrightPage.url()).toBe(urlBefore)
  })

  test('ConfirmDialog responds to Escape key to cancel', async ({ parts, partsDocuments, testData, backendUrl }) => {
    // Create a part with a link document
    const { part } = await testData.parts.create({
      overrides: {
        description: makeUnique('Part with Document for Escape'),
      },
    })

    const documentUrl = deterministicImageUrl(backendUrl, 'Test Document for Escape')
    const attachment = await testData.attachments.createUrl(part.key, {
      url: documentUrl,
      title: 'Escape Test Document',
    })

    // Navigate to part detail
    await parts.gotoList()
    await parts.waitForCards()
    await parts.openCardByKey(part.key)

    // Wait for document tile to be visible
    await partsDocuments.waitForAttachmentCount(1)
    const tile = partsDocuments.documentTileById(attachment.id)
    await expect(tile).toBeVisible()

    // Click delete button to open ConfirmDialog
    await tile.getByTitle('Delete').click()

    // Wait for dialog to appear
    const dialog = parts.playwrightPage.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Press Escape to cancel
    await parts.playwrightPage.keyboard.press('Escape')

    // Verify dialog closed
    await expect(dialog).not.toBeVisible()

    // Verify document was NOT deleted via backend
    await expect.poll(async () => (await testData.attachments.list(part.key)).length).toBe(1)
  })

  test('SellerCreateDialog submits form with Enter key in last input field', async ({ parts, toastHelper }) => {
    // Navigate to new part form
    await parts.gotoList()
    await parts.openNewPartForm()

    // Trigger inline seller creation
    const selector = new SellerSelectorHarness(parts.playwrightPage)
    await selector.waitForReady()

    const inlineSellerName = makeUnique('Keyboard Seller')
    const inlineWebsite = `https://keyboard-${makeUniqueToken(8)}.example.com`

    await selector.triggerInlineCreate(inlineSellerName)
    await expect(selector.inlineCreateDialog).toBeVisible()

    // Fill name field
    const nameField = parts.playwrightPage.getByTestId('sellers.selector.create.field.name')
    await nameField.fill(inlineSellerName)

    // Fill website field and press Enter
    const websiteField = parts.playwrightPage.getByTestId('sellers.selector.create.field.website')
    await websiteField.fill(inlineWebsite)
    await websiteField.press('Enter')

    // Verify seller was created
    await toastHelper.expectSuccessToast(/seller created successfully/i)
    await selector.expectSelected(inlineSellerName)

    // Verify dialog closed
    await expect(selector.inlineCreateDialog).not.toBeVisible()

    // Verify parent form is still visible (not submitted)
    await expect(parts.formRoot).toBeVisible()
  })

  test('Tab navigation works correctly in SellerCreateDialog', async ({ parts }) => {
    // Navigate to new part form
    await parts.gotoList()
    await parts.openNewPartForm()

    // Trigger inline seller creation
    const selector = new SellerSelectorHarness(parts.playwrightPage)
    await selector.waitForReady()

    const inlineSellerName = makeUnique('Tab Seller')

    await selector.triggerInlineCreate(inlineSellerName)
    await expect(selector.inlineCreateDialog).toBeVisible()

    // Focus should start on name field
    const nameField = parts.playwrightPage.getByTestId('sellers.selector.create.field.name')
    await expect(nameField).toBeFocused()

    // Tab to website field
    await parts.playwrightPage.keyboard.press('Tab')
    const websiteField = parts.playwrightPage.getByTestId('sellers.selector.create.field.website')
    await expect(websiteField).toBeFocused()

    // Fill both fields to enable submit button
    await nameField.fill(inlineSellerName)
    await websiteField.fill(`https://tab-${makeUniqueToken(8)}.example.com`)

    // Tab to cancel button
    await parts.playwrightPage.keyboard.press('Tab')
    const cancelButton = parts.playwrightPage.getByRole('button', { name: /cancel/i })
    await expect(cancelButton).toBeFocused()

    // Tab to submit button (now enabled)
    await parts.playwrightPage.keyboard.press('Tab')
    const submitButton = parts.playwrightPage.getByTestId('sellers.selector.create.submit')
    await expect(submitButton).toBeFocused()

    // Press Escape to close dialog
    await parts.playwrightPage.keyboard.press('Escape')
    await expect(selector.inlineCreateDialog).not.toBeVisible()
  })
})
