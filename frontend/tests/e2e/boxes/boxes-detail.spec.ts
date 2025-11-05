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
    await expect(boxes.detailSummary).toContainText(new RegExp(`Usage:?\\s*1\\/${box.capacity}`, 'i'))

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

  test('displays parts in visual card layout within location containers', async ({ boxes, parts, partsLocations, testData }) => {
    const description = makeUnique('Visual Layout Box')
    const box = await createBoxWithRetry(testData, { description, capacity: 60 })

    // Create multiple parts in different locations
    const part1 = await testData.parts.create({ overrides: { description: makeUnique('Visual Part 1') } })
    const part2 = await testData.parts.create({ overrides: { description: makeUnique('Visual Part 2') } })
    const part3 = await testData.parts.create({ overrides: { description: makeUnique('Visual Part 3') } })

    // Add parts to locations
    await parts.gotoList()
    await parts.waitForCards()
    await parts.openCardByKey(part1.part.key)
    await parts.detailRoot.getByRole('button', { name: /add stock/i }).click()
    await partsLocations.fillAddLocation({ boxNo: box.box_no, locNo: 1, quantity: 5 })
    await partsLocations.saveNewLocation(part1.part.key)
    await partsLocations.waitForTotal(5)

    await parts.gotoList()
    await parts.waitForCards()
    await parts.openCardByKey(part2.part.key)
    await parts.detailRoot.getByRole('button', { name: /add stock/i }).click()
    await partsLocations.fillAddLocation({ boxNo: box.box_no, locNo: 2, quantity: 10 })
    await partsLocations.saveNewLocation(part2.part.key)
    await partsLocations.waitForTotal(10)

    await parts.gotoList()
    await parts.waitForCards()
    await parts.openCardByKey(part3.part.key)
    await parts.detailRoot.getByRole('button', { name: /add stock/i }).click()
    await partsLocations.fillAddLocation({ boxNo: box.box_no, locNo: 2, quantity: 3 })
    await partsLocations.saveNewLocation(part3.part.key)
    await partsLocations.waitForTotal(3)

    // Navigate to box detail
    await boxes.gotoList()
    await boxes.openDetail(box.box_no)

    // Verify location containers are visible and have correct attributes
    await expect(boxes.locationContainer(box.box_no, 1)).toBeVisible()
    await expect(boxes.locationContainer(box.box_no, 1)).toHaveAttribute('data-location-id', `${box.box_no}-1`)
    await expect(boxes.locationContainer(box.box_no, 2)).toBeVisible()
    await expect(boxes.locationContainer(box.box_no, 2)).toHaveAttribute('data-location-id', `${box.box_no}-2`)

    // Verify location 1 has 1 part
    const loc1PartCount = await boxes.getLocationPartCount(box.box_no, 1)
    expect(loc1PartCount).toBe(1)
    await expect(boxes.locationContainer(box.box_no, 1)).toHaveAttribute('data-part-count', '1')

    // Verify location 2 has 2 parts
    const loc2PartCount = await boxes.getLocationPartCount(box.box_no, 2)
    expect(loc2PartCount).toBe(2)
    await expect(boxes.locationContainer(box.box_no, 2)).toHaveAttribute('data-part-count', '2')

    // Verify part cards are visible
    await boxes.expectPartCardVisible(part1.part.key)
    await boxes.expectPartCardVisible(part2.part.key)
    await boxes.expectPartCardVisible(part3.part.key)

    // Verify quantities on cards
    const card1 = boxes.partCard(part1.part.key)
    const badge1 = card1.getByTestId(`boxes.detail.part-card.quantity-${part1.part.key}`)
    await expect(badge1).toContainText('5')

    const card2 = boxes.partCard(part2.part.key)
    const badge2 = card2.getByTestId(`boxes.detail.part-card.quantity-${part2.part.key}`)
    await expect(badge2).toContainText('10')

    const card3 = boxes.partCard(part3.part.key)
    const badge3 = card3.getByTestId(`boxes.detail.part-card.quantity-${part3.part.key}`)
    await expect(badge3).toContainText('3')
  })

  test('hides empty locations from display', async ({ boxes, testData }) => {
    const description = makeUnique('Empty Locations Box')
    const box = await createBoxWithRetry(testData, { description, capacity: 20 })

    await boxes.gotoList()
    await boxes.openDetail(box.box_no)

    // Verify that empty locations are not displayed
    await expect(boxes.detailLocations).toContainText('No parts found')

    // Verify specific empty locations are not rendered
    await boxes.expectLocationEmpty(box.box_no, 1)
    await boxes.expectLocationEmpty(box.box_no, 5)
    await boxes.expectLocationEmpty(box.box_no, 10)
  })

  test('filters parts across all locations using search', async ({ boxes, parts, partsLocations, testData }) => {
    const description = makeUnique('Search Filter Box')
    const box = await createBoxWithRetry(testData, { description, capacity: 60 })

    // Create parts with distinctive descriptions
    const resistorPart = await testData.parts.create({
      overrides: {
        description: makeUnique('Resistor 10K Ohm'),
        manufacturer_code: 'RES-10K'
      }
    })
    const capacitorPart = await testData.parts.create({
      overrides: {
        description: makeUnique('Capacitor 100uF'),
        manufacturer_code: 'CAP-100UF'
      }
    })
    const ledPart = await testData.parts.create({
      overrides: {
        description: makeUnique('LED Red 5mm'),
        manufacturer_code: 'LED-RED-5'
      }
    })

    // Add parts to different locations
    await parts.gotoList()
    await parts.waitForCards()
    await parts.openCardByKey(resistorPart.part.key)
    await parts.detailRoot.getByRole('button', { name: /add stock/i }).click()
    await partsLocations.fillAddLocation({ boxNo: box.box_no, locNo: 1, quantity: 50 })
    await partsLocations.saveNewLocation(resistorPart.part.key)
    await partsLocations.waitForTotal(50)

    await parts.gotoList()
    await parts.waitForCards()
    await parts.openCardByKey(capacitorPart.part.key)
    await parts.detailRoot.getByRole('button', { name: /add stock/i }).click()
    await partsLocations.fillAddLocation({ boxNo: box.box_no, locNo: 2, quantity: 25 })
    await partsLocations.saveNewLocation(capacitorPart.part.key)
    await partsLocations.waitForTotal(25)

    await parts.gotoList()
    await parts.waitForCards()
    await parts.openCardByKey(ledPart.part.key)
    await parts.detailRoot.getByRole('button', { name: /add stock/i }).click()
    await partsLocations.fillAddLocation({ boxNo: box.box_no, locNo: 3, quantity: 100 })
    await partsLocations.saveNewLocation(ledPart.part.key)
    await partsLocations.waitForTotal(100)

    // Navigate to box detail
    await boxes.gotoList()
    await boxes.openDetail(box.box_no)

    // Initially, all parts should be visible
    await boxes.expectPartCardVisible(resistorPart.part.key)
    await boxes.expectPartCardVisible(capacitorPart.part.key)
    await boxes.expectPartCardVisible(ledPart.part.key)

    // Search by description keyword
    await boxes.searchParts('Resistor')
    await boxes.expectPartCardVisible(resistorPart.part.key)
    await boxes.expectPartCardNotVisible(capacitorPart.part.key)
    await boxes.expectPartCardNotVisible(ledPart.part.key)

    // Clear search
    await boxes.clearPartSearch()
    await boxes.expectPartCardVisible(resistorPart.part.key)
    await boxes.expectPartCardVisible(capacitorPart.part.key)
    await boxes.expectPartCardVisible(ledPart.part.key)

    // Search by manufacturer code
    await boxes.searchParts('CAP-100')
    await boxes.expectPartCardNotVisible(resistorPart.part.key)
    await boxes.expectPartCardVisible(capacitorPart.part.key)
    await boxes.expectPartCardNotVisible(ledPart.part.key)

    // Search by part key
    await boxes.detailSearch.fill(ledPart.part.key)
    await boxes.expectPartCardNotVisible(resistorPart.part.key)
    await boxes.expectPartCardNotVisible(capacitorPart.part.key)
    await boxes.expectPartCardVisible(ledPart.part.key)

    // Search with no matches
    await boxes.searchParts('NonExistentPart')
    await expect(boxes.detailLocations).toContainText('No parts match your search')
    await boxes.expectPartCardNotVisible(resistorPart.part.key)
    await boxes.expectPartCardNotVisible(capacitorPart.part.key)
    await boxes.expectPartCardNotVisible(ledPart.part.key)
  })

  test('navigates to part detail when clicking part card', async ({ boxes, parts, partsLocations, testData }) => {
    const description = makeUnique('Navigation Box')
    const box = await createBoxWithRetry(testData, { description, capacity: 30 })

    const part = await testData.parts.create({
      overrides: { description: makeUnique('Navigation Part') }
    })

    await parts.gotoList()
    await parts.waitForCards()
    await parts.openCardByKey(part.part.key)
    await parts.detailRoot.getByRole('button', { name: /add stock/i }).click()
    await partsLocations.fillAddLocation({ boxNo: box.box_no, locNo: 1, quantity: 15 })
    await partsLocations.saveNewLocation(part.part.key)
    await partsLocations.waitForTotal(15)

    await boxes.gotoList()
    await boxes.openDetail(box.box_no)

    await boxes.expectPartCardVisible(part.part.key)

    // Click the part card
    await boxes.clickPartCard(part.part.key)

    // Verify navigation to part detail page
    await expect(parts.detailRoot).toBeVisible()
    await expect(boxes.playwrightPage).toHaveURL(new RegExp(`/parts/${part.part.key}`))
  })
})
