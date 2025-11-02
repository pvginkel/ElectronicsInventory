import { test, expect } from '../../support/fixtures'
import { makeUnique, expectConsoleError } from '../../support/helpers'
import type { createTestDataBundle } from '../../api'

type TestDataBundle = ReturnType<typeof createTestDataBundle>

test.describe('Boxes - List Experience', () => {
  async function createSeedBox(
    testData: TestDataBundle,
    description: string,
    capacity: number
  ) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await testData.boxes.create({
          overrides: {
            description,
            capacity
          }
        })
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('409')) {
          throw error
        }
      }
    }
    throw new Error('Unable to create unique box after multiple attempts')
  }

  test('renders loading state, lists seeded boxes, and filters via search', async ({ boxes, testData, testEvents }) => {
    const prefix = makeUnique('QA-Boxes')
    const alphaDescription = `${prefix}-Alpha`
    const betaDescription = `${prefix}-Beta`
    const alphaBox = await createSeedBox(testData, alphaDescription, 10)
    const betaBox = await createSeedBox(testData, betaDescription, 12)
    await Promise.all(
      Array.from({ length: 4 }).map((_, index) =>
        createSeedBox(testData, `${prefix}-Overflow-${index}`, 8 + index),
      ),
    )

    await testEvents.clearEvents()
    await boxes.goto('/boxes')
    await boxes.waitForListState('loading')
    await boxes.waitForListState('ready')
    await expect(boxes.listTable).toBeVisible({ timeout: 15000 })
    await boxes.expectCardVisible(alphaBox.box_no)
    await boxes.expectCardVisible(betaBox.box_no)
    await expect(boxes.summary).toContainText(/\d+ boxes/i)

    const headerBefore = await boxes.header.boundingBox()
    expect(headerBefore).toBeTruthy()
    await boxes.scrollContentBy(800)
    await expect(boxes.header).toBeVisible()
    const headerAfter = await boxes.header.boundingBox()
    expect(headerAfter).toBeTruthy()
    expect(headerAfter && headerBefore).toBeTruthy()
    if (headerBefore && headerAfter) {
      expect(Math.abs(headerAfter.y - headerBefore.y)).toBeLessThan(1)
    }

    await boxes.search(alphaDescription)
    await expect(boxes.boxCard(alphaBox.box_no)).toBeVisible()
    await expect(boxes.boxCard(betaBox.box_no)).toBeHidden()
    await expect(boxes.listTable.locator('[data-testid^="boxes.list.item."]')).toHaveCount(1)
    await expect(boxes.summary).toContainText(/1 of \d+ boxes showing/i)
    await expect(boxes.playwrightPage.getByTestId('list-screen.counts.filtered')).toHaveText(/1 filtered/i)

    await boxes.clearSearch()
    await expect(boxes.boxCard(alphaBox.box_no)).toBeVisible()
    await expect(boxes.boxCard(betaBox.box_no)).toBeVisible()
    await expect(boxes.summary).toContainText(/\d+ boxes/i)
  })

  test('debounced search updates URL and filters boxes', async ({ page, boxes, testData }) => {
    const prefix = makeUnique('Search-Test')
    const storageDescription = `${prefix}-Storage`
    const componentsDescription = `${prefix}-Components`

    const storageBox = await createSeedBox(testData, storageDescription, 15)
    await createSeedBox(testData, componentsDescription, 20)

    await boxes.gotoList()

    // Search for the unique storage box description to ensure only 1 match
    await boxes.search(storageDescription)

    // Verify URL updated with search parameter
    await expect(page).toHaveURL(/search=/)

    // Verify filtered results
    await expect(boxes.boxCard(storageBox.box_no)).toBeVisible()
    await expect(boxes.summary).toContainText(/1 of \d+ boxes showing/i)

    // Clear should update URL immediately (bypass debounce)
    await boxes.clearSearch()
    await expect(page).toHaveURL(/^(?!.*search)/)
    await expect(boxes.summary).toContainText(/\d+ boxes/i)
  })

  test('creates, edits, and deletes a box with instrumentation and toasts', async ({ boxes, testEvents, toastHelper }) => {
    const description = makeUnique('Playwright Box')

    await boxes.gotoList()
    await testEvents.clearEvents()
    await boxes.openCreateForm()
    await boxes.fillBoxForm('boxes.create', { description, capacity: 18 })

    await boxes.submitBoxForm('boxes.create')
    const createEvents = await testEvents.getEvents()
    const createSubmit = createEvents.find(event => event.kind === 'form' && event.formId === 'boxes.create' && event.phase === 'submit')
    expect(createSubmit).toBeTruthy()

    await toastHelper.expectSuccessToast(/box created successfully/i)
    await toastHelper.waitForToastViewportDismissed()

    const createdCard = boxes.listTable.locator(`[data-testid^="boxes.list.item."]`, { hasText: description })
    await expect(createdCard).toBeVisible()
    const createdBoxNoAttr = await createdCard.getAttribute('data-box-no')
    expect(createdBoxNoAttr).toBeTruthy()
    const createdBoxNo = Number(createdBoxNoAttr)
    expect(Number.isFinite(createdBoxNo)).toBeTruthy()

    const updatedDescription = `${description} Updated`
    await boxes.openDetail(createdBoxNo)
    await boxes.detailEditButton.click()
    await boxes.fillBoxForm(`boxes.detail.edit.${createdBoxNo}`, { description: updatedDescription, capacity: 24 })

    await boxes.submitBoxForm(`boxes.detail.edit.${createdBoxNo}`)
    const editEvents = await testEvents.getEvents()
    const editSubmit = editEvents.find(event => event.kind === 'form' && typeof event.formId === 'string' && event.formId.startsWith('boxes.detail.edit.') && event.phase === 'submit')
    expect(editSubmit).toBeTruthy()
    await toastHelper.expectSuccessToast(/box updated successfully/i)
    await toastHelper.waitForToastViewportDismissed()
    await expect(boxes.detailSummary).toContainText(updatedDescription)

    await boxes.returnToListFromDetail()
    await expect(boxes.boxCard(createdBoxNo)).toContainText(updatedDescription)

    await boxes.openDetail(createdBoxNo)
    await expectConsoleError(boxes.playwrightPage, /404 \(NOT FOUND\)/)
    await boxes.detailDeleteButton.click()
    const confirmDialog = boxes.playwrightPage.getByRole('dialog', { name: /delete box/i })
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: /delete/i }).click()

    await toastHelper.expectSuccessToast(new RegExp(`Box #${createdBoxNo} deleted`, 'i'))
    await toastHelper.waitForToastViewportDismissed()
    await expect(boxes.boxCard(createdBoxNo)).toBeHidden()
  })
})
