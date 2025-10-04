import { createApiClient, apiRequest } from '../client';
import { makeUnique, makeUniqueToken } from '../../support/helpers';
import type { components } from '../../../src/lib/api/generated/types';

type SellerCreateSchema = components['schemas']['SellerCreateSchema.ceefe26'];
type SellerResponseSchema = components['schemas']['SellerResponseSchema.ceefe26'];

interface SellerCreateOptions {
  overrides?: Partial<SellerCreateSchema>;
}

/**
 * Factory for creating test Sellers via the API
 */
export class SellerTestFactory {
  private client: ReturnType<typeof createApiClient>;
  private sellerDatabase = [
    { name: 'DigiKey', url: 'https://www.digikey.com' },
    { name: 'Mouser', url: 'https://www.mouser.com' },
    { name: 'Farnell', url: 'https://www.farnell.com' },
    { name: 'RS Components', url: 'https://www.rs-online.com' },
    { name: 'Arrow', url: 'https://www.arrow.com' },
    { name: 'LCSC', url: 'https://www.lcsc.com' },
    { name: 'Adafruit', url: 'https://www.adafruit.com' },
    { name: 'SparkFun', url: 'https://www.sparkfun.com' },
    { name: 'AliExpress', url: 'https://www.aliexpress.com' },
    { name: 'Amazon', url: 'https://www.amazon.com' },
  ];

  constructor(client?: ReturnType<typeof createApiClient>) {
    this.client = client || createApiClient();
  }

  /**
   * Creates a new seller with optional overrides
   * @param options - Configuration for creating the seller
   * @returns The created seller
   */
  async create(options?: SellerCreateOptions): Promise<SellerResponseSchema> {
    // Build the request body with defaults and overrides
    const sellerData: SellerCreateSchema = {
      name: options?.overrides?.name ?? this.randomSellerName(),
      website: options?.overrides?.website ?? this.randomSellerUrl(),
      ...options?.overrides,
    };

    const seller = await apiRequest(() =>
      this.client.POST('/api/sellers', {
        body: sellerData,
      })
    );

    return seller;
  }

  /**
   * Creates a seller from a known vendor
   * @param vendorName - Name of a known vendor or index into vendor database
   * @returns The created seller
   */
  async createKnownVendor(vendorName?: string | number): Promise<SellerResponseSchema> {
    let vendor;

    if (typeof vendorName === 'number') {
      vendor = this.sellerDatabase[vendorName % this.sellerDatabase.length];
    } else if (vendorName) {
      vendor = this.sellerDatabase.find(
        v => v.name.toLowerCase() === vendorName.toLowerCase()
      ) ?? this.sellerDatabase[0];
    } else {
      vendor = this.randomKnownVendor();
    }

    // Add a unique suffix to avoid conflicts in tests
    const uniqueSuffix = makeUniqueToken();
    return this.create({
      overrides: {
        name: `${vendor.name} Test-${uniqueSuffix}`,
        website: vendor.url,
      },
    });
  }

  /**
   * Creates multiple sellers for testing
   * @param count - Number of sellers to create
   * @param options - Options to apply to all sellers
   * @returns Array of created sellers
   */
  async createMany(count: number, options?: SellerCreateOptions): Promise<SellerResponseSchema[]> {
    const sellers: SellerResponseSchema[] = [];

    for (let i = 0; i < count; i++) {
      const seller = await this.create({
        ...options,
        overrides: {
          ...options?.overrides,
          name: options?.overrides?.name ?? `${this.randomSellerName()} ${i + 1}`,
        },
      });
      sellers.push(seller);
    }

    return sellers;
  }

  /**
   * Creates a set of common test sellers
   * @returns Object with named seller instances
   */
  async createTestSet(): Promise<{
    primary: SellerResponseSchema;
    secondary: SellerResponseSchema;
    alternative: SellerResponseSchema;
  }> {
    const [primary, secondary, alternative] = await Promise.all([
      this.create({ overrides: { name: 'Primary Test Seller' } }),
      this.create({ overrides: { name: 'Secondary Test Seller' } }),
      this.create({ overrides: { name: 'Alternative Test Seller' } }),
    ]);

    return { primary, secondary, alternative };
  }

  /**
   * Generates a random seller name
   * @param prefix - Optional prefix for the name
   * @returns A unique seller name
  */
  randomSellerName(prefix: string = 'Test Seller'): string {
    return makeUnique(prefix);
  }

  /**
   * Generates a random seller URL
   * @returns A unique seller URL
   */
  randomSellerUrl(): string {
    const id = makeUniqueToken(8);
    return `https://test-seller-${id}.example.com`;
  }

  /**
   * Returns a random known vendor from the database
   * @returns A known vendor object
   */
  private randomKnownVendor(): { name: string; url: string } {
    return this.sellerDatabase[Math.floor(Math.random() * this.sellerDatabase.length)];
  }

  /**
   * Creates a seller with specific part links
   * @param partLinks - Array of part link URLs
   * @param options - Additional options
   * @returns Seller with part link metadata
   */
  async createWithPartLinks(
    partLinks: string[],
    options?: SellerCreateOptions
  ): Promise<{
    seller: SellerResponseSchema;
    partLinks: string[];
  }> {
    const seller = await this.create(options);

    // Note: Part links would typically be managed through
    // the parts themselves, not the seller
    return {
      seller,
      partLinks,
    };
  }
}
