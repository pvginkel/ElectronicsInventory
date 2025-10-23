import { createApiClient, apiRequest } from './client';
import { TypeTestFactory } from './factories/type-factory';
import { PartTestFactory } from './factories/part-factory';
import { AttachmentTestFactory } from './factories/attachment-factory';
import { BoxTestFactory } from './factories/box-factory';
import { SellerTestFactory } from './factories/seller-factory';
import { ShoppingListTestFactory } from './factories/shopping-list-factory';
import { KitTestFactory } from './factories/kit-factory';

// Re-export the main functions and factories
export { createApiClient, apiRequest };
export { TypeTestFactory };
export { PartTestFactory };
export { AttachmentTestFactory };
export { BoxTestFactory };
export { SellerTestFactory };
export { ShoppingListTestFactory };
export { KitTestFactory };

/**
 * Creates a testData bundle with all factories for use in fixtures
 * @param client - Optional API client instance to share between factories
 * @returns Bundle of factory instances organized by domain
 */
export function createTestDataBundle(
  client?: ReturnType<typeof createApiClient>,
  options: { backendUrl?: string } = {}
) {
  const apiClient = client || createApiClient();
  const typeFactory = new TypeTestFactory(apiClient);
  const partFactory = new PartTestFactory(apiClient);
  const attachmentFactory = new AttachmentTestFactory(
    apiClient,
    options.backendUrl
  );
  const boxFactory = new BoxTestFactory(apiClient);
  const sellerFactory = new SellerTestFactory(apiClient);
  const shoppingListFactory = new ShoppingListTestFactory(apiClient);
  const kitFactory = new KitTestFactory(apiClient);

  const attachments = {
    createUrl: attachmentFactory.createUrl.bind(attachmentFactory),
    createBinary: attachmentFactory.createBinary.bind(attachmentFactory),
    list: attachmentFactory.list.bind(attachmentFactory),
    get: attachmentFactory.get.bind(attachmentFactory),
    delete: attachmentFactory.delete.bind(attachmentFactory),
    getCover: attachmentFactory.getCover.bind(attachmentFactory),
    setCover: attachmentFactory.setCover.bind(attachmentFactory),
    clearCover: attachmentFactory.clearCover.bind(attachmentFactory),
  } as const;

  return {
    types: {
      create: typeFactory.create.bind(typeFactory),
      randomTypeName: typeFactory.randomTypeName.bind(typeFactory),
      findByName: typeFactory.findByName.bind(typeFactory),
    },
    parts: {
      create: partFactory.create.bind(partFactory),
      randomPartDescription: partFactory.randomPartDescription.bind(partFactory),
      randomManufacturerCode: partFactory.randomManufacturerCode.bind(partFactory),
      createWithStock: partFactory.createWithStock.bind(partFactory),
      createWithLocation: partFactory.createWithLocation.bind(partFactory),
      createWithDocuments: partFactory.createWithDocuments.bind(partFactory),
      createComplete: partFactory.createComplete.bind(partFactory),
      getDetail: partFactory.getDetail.bind(partFactory),
      listWithLocations: partFactory.listWithLocations.bind(partFactory),
    },
    attachments,
    boxes: {
      create: boxFactory.create.bind(boxFactory),
      createWithLocations: boxFactory.createWithLocations.bind(boxFactory),
      createMany: boxFactory.createMany.bind(boxFactory),
      createWithUtilization: boxFactory.createWithUtilization.bind(boxFactory),
      randomBoxDescription: boxFactory.randomBoxDescription.bind(boxFactory),
      randomBoxCode: boxFactory.randomBoxCode.bind(boxFactory),
    },
    sellers: {
      create: sellerFactory.create.bind(sellerFactory),
      createKnownVendor: sellerFactory.createKnownVendor.bind(sellerFactory),
      createMany: sellerFactory.createMany.bind(sellerFactory),
      createTestSet: sellerFactory.createTestSet.bind(sellerFactory),
      createWithPartLinks: sellerFactory.createWithPartLinks.bind(sellerFactory),
      randomSellerName: sellerFactory.randomSellerName.bind(sellerFactory),
      randomSellerUrl: sellerFactory.randomSellerUrl.bind(sellerFactory),
    },
    shoppingLists: {
      create: shoppingListFactory.createList.bind(shoppingListFactory),
      createWithLines: shoppingListFactory.createListWithLines.bind(shoppingListFactory),
      createLine: shoppingListFactory.createLine.bind(shoppingListFactory),
      getDetail: shoppingListFactory.getListDetail.bind(shoppingListFactory),
      orderLine: shoppingListFactory.orderLine.bind(shoppingListFactory),
      revertLine: shoppingListFactory.revertLine.bind(shoppingListFactory),
      markReady: shoppingListFactory.markReady.bind(shoppingListFactory),
      markDone: shoppingListFactory.markDone.bind(shoppingListFactory),
      receiveLine: shoppingListFactory.receiveLine.bind(shoppingListFactory),
      completeLine: shoppingListFactory.completeLine.bind(shoppingListFactory),
      randomName: shoppingListFactory.randomListName.bind(shoppingListFactory),
      expectConceptMembership: shoppingListFactory.expectConceptMembership.bind(shoppingListFactory),
    },
    kits: {
      create: kitFactory.create.bind(kitFactory),
      createMany: kitFactory.createMany.bind(kitFactory),
      addContent: kitFactory.addContent.bind(kitFactory),
      updateContent: kitFactory.updateContent.bind(kitFactory),
      deleteContent: kitFactory.deleteContent.bind(kitFactory),
      getDetail: kitFactory.getDetail.bind(kitFactory),
      archive: kitFactory.archive.bind(kitFactory),
      unarchive: kitFactory.unarchive.bind(kitFactory),
      randomKitName: kitFactory.randomKitName.bind(kitFactory),
      randomKitDescription: kitFactory.randomKitDescription.bind(kitFactory),
    },
  };
}
