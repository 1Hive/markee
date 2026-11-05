// Existing financial operations remain bound to the API that prepared them.
// Only the known former default is searched; custom API environments stay isolated.
export const PRODUCTION_API_URL = 'https://www.markee.xyz/api/sdk/v1';
export const FORMER_API_URL = 'https://staging.markee.xyz/api/sdk/v1';
export function storageOrigins(apiUrl: string): string[] {
  return apiUrl === PRODUCTION_API_URL ? [apiUrl, FORMER_API_URL] : [apiUrl];
}
