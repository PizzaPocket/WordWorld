import { GoogleGenerativeAI } from '@google/generative-ai'
import { SYSTEM_PROMPT } from './prompts.js'

/** @type {import('@google/generative-ai').GenerativeModel|null} */
let model = null

/**
 * Initialise the Gemini client with the player's API key.
 * Must be called before generate().
 * @param {string} apiKey
 */
export function initClient(apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey)
  model = genAI.getGenerativeModel(
    {
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 1.3,
        maxOutputTokens: 1024,
      },
    },
    { apiVersion: 'v1' }
  )
}

/** @returns {boolean} */
export function isInitialized() {
  return model !== null
}

/**
 * Send a prompt to Gemini and return the raw text response.
 * Throws immediately on any error, including 429 rate limits.
 * @param {string} userPrompt
 * @returns {Promise<string>}
 */
export async function generate(userPrompt) {
  if (!model) throw new Error('Gemini client not initialised. Call initClient(apiKey) first.')

  const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`

  try {
    const result = await model.generateContent(fullPrompt)
    return result.response.text()
  } catch (err) {
    console.error('[Gemini error]', err)
    throw err
  }
}
