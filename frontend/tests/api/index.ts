import { createApiClient, apiRequest } from './client';
import { TypeTestFactory } from './factories/type-factory';
import { PartTestFactory } from './factories/part-factory';
import { BoxTestFactory } from './factories/box-factory';
import { SellerTestFactory } from './factories/seller-factory';

// Re-export the main functions and factories
export { createApiClient, apiRequest };
export { TypeTestFactory };
export { PartTestFactory };
export { BoxTestFactory };
export { SellerTestFactory };

/**
 * Creates a testData bundle with all factories for use in fixtures
 * @param client - Optional API client instance to share between factories
 * @returns Bundle of factory instances organized by domain
 */
export function createTestDataBundle(client?: ReturnType<typeof createApiClient>) {
  const apiClient = client || createApiClient();
  const typeFactory = new TypeTestFactory(apiClient);
  const partFactory = new PartTestFactory(apiClient);
  const boxFactory = new BoxTestFactory(apiClient);
  const sellerFactory = new SellerTestFactory(apiClient);

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
    },
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
  };
}