import { test, expect } from '../../support/fixtures'
import { expectConsoleError } from '../../support/helpers'

test.describe('Boxes - Detail View', () => {
test('shows usage metrics, location assignments, and supports deletion from detail', async ({ boxes, parts, partsLocations, testData, toastHelper }) => {
    const description = `Detail Box ${Date.now()}`
    const box = await testData.boxes.create({ overrides: { description, capacity: 20 } })
    const { part } = await testData.parts.create({ overrides: { description: `Box Detail Part ${Date.now()}` } })

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

    await expect(boxes.detailSummary).toContainText('Box Number')
    await expect(boxes.detailSummary).toContainText(String(box.box_no))
    await expect(boxes.detailSummary).toContainText(box.description)
    await expect(boxes.detailSummary).toContainText(/Usage\s*1\/20/i)

    await boxes.expectLocationOccupied(box.box_no, 4, { partKey: part.key, quantity: 3 })

    await expectConsoleError(boxes.playwrightPage, /cannot delete box/i)
    await boxes.detailRoot.getByRole('button', { name: /delete box/i }).click()
    const confirmDialog = boxes.playwrightPage.getByRole('dialog', { name: /delete box/i })
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: /delete/i }).click()

    await toastHelper.waitForToastWithText(new RegExp(`Cannot delete box ${box.box_no}`, 'i'))
    await expect(boxes.detailRoot).toBeVisible()
    await toastHelper.dismissToast({ all: true })
  })
})
