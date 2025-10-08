import { test, expect } from '../../support/fixtures'
import { makeUnique } from '../../support/helpers'
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

    await testEvents.clearEvents()
    await boxes.goto('/boxes')
    await boxes.waitForListState('loading')
    await boxes.waitForListState('ready')
    await expect(boxes.listTable).toBeVisible({ timeout: 15000 })
    await boxes.expectCardVisible(alphaBox.box_no)
    await boxes.expectCardVisible(betaBox.box_no)

    await boxes.search(alphaDescription)
    await expect(boxes.boxCard(alphaBox.box_no)).toBeVisible()
    await expect(boxes.boxCard(betaBox.box_no)).toBeHidden()
    await expect(boxes.listTable.locator('[data-testid^="boxes.list.item."]')).toHaveCount(1)

    await boxes.clearSearch()
    await expect(boxes.boxCard(alphaBox.box_no)).toBeVisible()
    await expect(boxes.boxCard(betaBox.box_no)).toBeVisible()
  })

  test('creates, edits, and deletes a box with instrumentation and toasts', async ({ boxes, testEvents, toastHelper }) => {
    const description = makeUnique('Playwright Box')

    await boxes.gotoList()
    await testEvents.clearEvents()
    await boxes.openCreateForm()
    await boxes.fillBoxForm('boxes.create', { description, capacity: 18 })

    const [createSubmit, createSuccess] = await Promise.all([
      testEvents.waitForEvent(event => event.kind === 'form' && event.formId === 'boxes.create' && event.phase === 'submit'),
      testEvents.waitForEvent(event => event.kind === 'form' && event.formId === 'boxes.create' && event.phase === 'success'),
      boxes.submitBoxForm('boxes.create')
    ])

    const createSubmitTs = new Date(createSubmit.timestamp).getTime()
    const createSuccessTs = new Date(createSuccess.timestamp).getTime()
    expect(createSuccessTs).toBeGreaterThan(createSubmitTs)
    await toastHelper.expectSuccessToast(/box created successfully/i)
    await boxes.waitForListState('ready')

    const createdCard = boxes.listTable.locator(`[data-testid^="boxes.list.item."]`, { hasText: description })
    await expect(createdCard).toBeVisible()
    const createdBoxNoAttr = await createdCard.getAttribute('data-box-no')
    expect(createdBoxNoAttr).toBeTruthy()
    const createdBoxNo = Number(createdBoxNoAttr)
    expect(Number.isFinite(createdBoxNo)).toBeTruthy()

    const updatedDescription = `${description} Updated`
    await testEvents.clearEvents()
    await boxes.openEditForm(createdBoxNo)
    await boxes.fillBoxForm(`boxes.edit.${createdBoxNo}`, { description: updatedDescription, capacity: 24 })

    const [editSubmit, editSuccess] = await Promise.all([
      testEvents.waitForEvent(event => event.kind === 'form' && event.formId === `boxes.edit.${createdBoxNo}` && event.phase === 'submit'),
      testEvents.waitForEvent(event => event.kind === 'form' && event.formId === `boxes.edit.${createdBoxNo}` && event.phase === 'success'),
      boxes.submitBoxForm(`boxes.edit.${createdBoxNo}`)
    ])

    const editSubmitTs = new Date(editSubmit.timestamp).getTime()
    const editSuccessTs = new Date(editSuccess.timestamp).getTime()
    expect(editSuccessTs).toBeGreaterThan(editSubmitTs)
    await toastHelper.expectSuccessToast(/box updated successfully/i)
    await boxes.waitForListState('ready')
    await expect(boxes.boxCard(createdBoxNo)).toContainText(updatedDescription)

    await boxes.deleteFromList(createdBoxNo)
    await toastHelper.expectSuccessToast(new RegExp(`Box #${createdBoxNo} deleted`, 'i'))
    await boxes.waitForListState('ready')
    await expect(boxes.boxCard(createdBoxNo)).toBeHidden()
    await toastHelper.dismissToast({ all: true })
  })
})
