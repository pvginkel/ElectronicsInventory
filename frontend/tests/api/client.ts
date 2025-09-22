import createClient from 'openapi-fetch';
import type { paths } from '../../src/lib/api/generated/types';

// Use Node's native fetch (available in Node 18+)
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:5100';

/**
 * Creates a typed API client for use in tests.
 * Uses the generated paths type from the OpenAPI spec for full type safety.
 */
export function createApiClient() {
  const client = createClient<paths>({
    baseUrl: backendUrl,
    // Use globalThis.fetch which is available in Node 18+
    fetch: globalThis.fetch,
  });

  // Return the client directly - openapi-fetch already provides full type safety
  // We'll handle errors at the factory level for cleaner code
  return client;
}