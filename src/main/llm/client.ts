import Anthropic from '@anthropic-ai/sdk'
import { app } from 'electron'
import { getApiKey } from '../store/secrets'

// One Anthropic client per API key. All Claude calls happen here in the main process.

let client: { key: string; instance: Anthropic } | null = null

export function getClient(): Anthropic | null {
  const key = getApiKey()
  if (!key) return null
  if (client?.key !== key) client = { key, instance: new Anthropic({ apiKey: key }) }
  return client.instance
}

/**
 * Development-only fake model: set SOTTO_FAKE_LLM=1 to get canned, streamed answers
 * without an API key or cost, so the whole UI can be tested end to end. Never active
 * in a packaged build.
 */
export const fakeModel = (): boolean => process.env['SOTTO_FAKE_LLM'] === '1' && !app.isPackaged

/** Server-side refusal fallback: if the model declines for policy reasons, the API
 *  retries on its default fallback model within the same request. */
export const fallback = (): { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: 'default' } => ({
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default'
})

/** Turn an SDK error into a short message the overlay can show. */
export function friendlyError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return 'Anthropic rejected the API key. Check it in Settings.'
  if (error instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use that model.'
  if (error instanceof Anthropic.RateLimitError) return 'Rate limit reached. Try again in a moment.'
  if (error instanceof Anthropic.BadRequestError) return `Claude could not process the request: ${error.message}`
  if (error instanceof Anthropic.APIConnectionError) return 'Could not reach Anthropic. Check your internet connection.'
  if (error instanceof Anthropic.APIError) return `Anthropic error ${error.status ?? ''}: ${error.message}`.trim()
  return error instanceof Error ? error.message : String(error)
}

/** Check a key before saving it: listing models is free and needs a valid key. */
export async function verifyApiKey(key: string): Promise<string | null> {
  try {
    await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 })
    return null
  } catch (error) {
    return friendlyError(error)
  }
}
