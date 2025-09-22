import createClient from 'openapi-fetch';
import type { paths } from '../../src/lib/api/generated/types';

// Use Node's native fetch (available in Node 18+)
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:5100';

/**
 * Request wrapper that throws on non-2xx responses
 * @param requestFn - The API request function to execute
 * @returns The response data
 * @throws Error if the request fails or returns no data
 */
export async function apiRequest<T>(
  requestFn: () => Promise<{ data?: T; error?: any; response: Response }>
): Promise<T> {
  const { data, error, response } = await requestFn();

  if (error || !response.ok) {
    // Try to extract more detail from the error if available
    const errorMessage = error?.message || error?.detail || '';
    const statusInfo = `${response.status} ${response.statusText}`;
    throw new Error(
      errorMessage
        ? `API request failed: ${statusInfo} - ${errorMessage}`
        : `API request failed: ${statusInfo}`
    );
  }

  if (!data) {
    throw new Error('API request succeeded but returned no data');
  }

  return data;
}

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

  // Return the client with the request wrapper attached for convenience
  return Object.assign(client, { apiRequest });
}