import { TEXT_MODELS, textThinking } from './gemini-text'

/**
 * Satu percubaan sahaja. Gelung Studio dalam gemini-text tidak diubah.
 * AbortSignal hanya menghentikan menunggu klien. Perkhidmatan mungkin tetap mengebil.
 * Kegagalan selepas permintaan dihantar dilayan sebagai tidak pasti dan tidak diulang.
 */

export class ModelAttemptError extends Error {
  readonly kind: 'tiada_kunci' | 'provider_failed' | 'uncertain'

  constructor(kind: 'tiada_kunci' | 'provider_failed' | 'uncertain') {
    super(kind)
    this.name = 'ModelAttemptError'
    this.kind = kind
  }
}

export type ModelOnce = {
  text: string
  model: string
  promptTokens: number | null
  outputTokens: number | null
}

function whole(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

async function generateLive(prompt: string, key: string): Promise<ModelOnce> {
  const model = TEXT_MODELS[0]
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey: key })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 22_000)
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: textThinking(model),
        abortSignal: controller.signal,
      },
    })
    const text = response.text?.trim()
    if (!text) throw new ModelAttemptError('provider_failed')
    return {
      text,
      model,
      promptTokens: whole(response.usageMetadata?.promptTokenCount),
      outputTokens: whole(response.usageMetadata?.candidatesTokenCount),
    }
  } catch (error) {
    if (error instanceof ModelAttemptError) throw error
    if (controller.signal.aborted) throw new ModelAttemptError('uncertain')
    throw new ModelAttemptError('provider_failed')
  } finally {
    clearTimeout(timer)
  }
}

export const copilotRuntime = {
  generate: generateLive,
}

export const publicRuntime = {
  generate: generateLive,
}

export async function askCopilotOnce(prompt: string) {
  const key = process.env.COPILOT_GEMINI_API_KEY || ''
  if (!key) throw new ModelAttemptError('tiada_kunci')
  return copilotRuntime.generate(prompt, key)
}

export async function askPublicOnce(prompt: string) {
  const key = process.env.GEMINI_API_KEY || ''
  if (!key) throw new ModelAttemptError('tiada_kunci')
  return publicRuntime.generate(prompt, key)
}
