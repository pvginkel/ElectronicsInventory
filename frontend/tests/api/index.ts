import { createApiClient, apiRequest } from './client';
import { TypeTestFactory } from './factories/type-factory';
import { PartTestFactory } from './factories/part-factory';

// Re-export the main functions and factories
export { createApiClient, apiRequest };
export { TypeTestFactory };
export { PartTestFactory };

/**
 * Creates a testData bundle with all factories for use in fixtures
 * @param client - Optional API client instance to share between factories
 * @returns Bundle of factory instances organized by domain
 */
export function createTestDataBundle(client?: ReturnType<typeof createApiClient>) {
  const apiClient = client || createApiClient();
  const typeFactory = new TypeTestFactory(apiClient);
  const partFactory = new PartTestFactory(apiClient);

  return {
    types: {
      create: typeFactory.create.bind(typeFactory),
      randomTypeName: typeFactory.randomTypeName.bind(typeFactory),
    },
    parts: {
      create: partFactory.create.bind(partFactory),
      randomPartDescription: partFactory.randomPartDescription.bind(partFactory),
      randomManufacturerCode: partFactory.randomManufacturerCode.bind(partFactory),
    },
  };
}