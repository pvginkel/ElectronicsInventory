import { test, expect } from '../../support/fixtures'
import { expectConsoleError, makeUnique } from '../../support/helpers'

async function createBoxWithRetry(testData: any, overrides: Record<string, unknown>, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await testData.boxes.create({ overrides });
    } catch (error) {
      if (error instanceof Error && error.message.includes('409')) {
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Failed to create box after multiple retries');
}

test.describe('Boxes - Detail View', () => {
test('shows usage metrics, location assignments, and supports deletion from detail', async ({ boxes, parts, partsLocations, testData, toastHelper }) => {
    const description = makeUnique('Detail Box')
    const box = await createBoxWithRetry(testData, { description, capacity: 60 })
    const { part } = await testData.parts.create({ overrides: { description: makeUnique('Box Detail Part') } })

    await parts.gotoList()
    await parts.waitForCards()
    await parts.openCardByKey(part.key)

    await partsLocations.expectEmpty()
    await parts.detailRoot.getByRole('button', { name: /add stock/i }).click()
    await partsLocations.fillAddLocation({ boxNo: box.box_no, locNo: 4, quantity: 3 })
    await partsLocations.saveNewLocation(part.key)
    await partsLocations.waitForTotal(3)

    await boxes.gotoList()
    await boxes.expectCardVisible(box.box_no)

    await boxes.openDetail(box.box_no)

    await expect(boxes.detailLayout).toBeVisible()
    await expect(boxes.detailSummary).toContainText('Box Number')
    await expect(boxes.detailSummary).toContainText(String(box.box_no))
    await expect(boxes.detailSummary).toContainText(box.description)
    await expect(boxes.detailSummary).toContainText(new RegExp(`Usage\\s*1\\/${box.capacity}`, 'i'))

    const headerBefore = await boxes.getDetailHeaderRect()
    const actionsBefore = await boxes.getDetailActionsRect()

    await boxes.detailContent.evaluate((element) => {
      const filler = document.createElement('div')
      filler.style.height = '1200px'
      filler.setAttribute('data-testid', 'boxes.detail.test-filler')
      element.appendChild(filler)
    })

    await boxes.scrollDetailContent('bottom')
    await expect.poll(() => boxes.detailContentScrollTop()).toBeGreaterThan(0)

    const headerAfter = await boxes.getDetailHeaderRect()
    const actionsAfter = await boxes.getDetailActionsRect()

    expect(Math.abs(headerAfter.top - headerBefore.top)).toBeLessThan(1)
    expect(Math.abs(actionsAfter.top - actionsBefore.top)).toBeLessThan(1)

    await boxes.expectLocationOccupied(box.box_no, 4, { partKey: part.key, quantity: 3 })

    await expectConsoleError(boxes.playwrightPage, /cannot delete box/i)
    await boxes.detailDeleteButton.click()
    const confirmDialog = boxes.playwrightPage.getByRole('dialog', { name: /delete box/i })
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: /delete/i }).click()

    await toastHelper.waitForToastWithText(new RegExp(`Cannot delete box ${box.box_no}`, 'i'))
    await expect(boxes.detailRoot).toBeVisible()
    await toastHelper.dismissToast({ all: true })
  })

  test('Usage badge displays danger color when usage reaches 90% threshold', async ({ boxes, parts, partsLocations, testData }) => {
    const description = makeUnique('High Usage Box')
    const capacity = 10
    const box = await createBoxWithRetry(testData, { description, capacity })

    // Create 9 parts and allocate them to reach 90% usage
    for (let i = 1; i <= 9; i++) {
      const { part } = await testData.parts.create({
        overrides: { description: makeUnique(`High Usage Part ${i}`) }
      })

      await parts.gotoList()
      await parts.waitForCards()
      await parts.openCardByKey(part.key)

      await partsLocations.expectEmpty()
      await parts.detailRoot.getByRole('button', { name: /add stock/i }).click()
      await partsLocations.fillAddLocation({ boxNo: box.box_no, locNo: i, quantity: 1 })
      await partsLocations.saveNewLocation(part.key)
      await partsLocations.waitForTotal(1)
    }

    await boxes.gotoList()
    await boxes.openDetail(box.box_no)

    const usageBadge = boxes.playwrightPage.getByTestId('boxes.detail.metadata.usage')
    await expect(usageBadge).toBeVisible()
    await expect(usageBadge).toContainText('Usage: 90%')
    await expect(usageBadge).toHaveClass(/text-rose-800/)
  })
})
