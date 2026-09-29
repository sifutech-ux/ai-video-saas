import { GoogleGenAI } from '@google/genai'
import { geminiKey, TEXT_MODELS, textThinking } from './gemini-text'
import { synthesizeMalay } from './malay-voice'
import { parseTranscript, penasihatSpoken, transcribePrompt } from './penasihat'

export async function transcribeMalay(audioBase64: string, mime: string) {
  if (!geminiKey()) throw new Error('tiada kunci')
  const ai = new GoogleGenAI({ apiKey: geminiKey() })
  let lastError = 'Suara tidak jelas.'

  for (const model of TEXT_MODELS) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: mime, data: audioBase64 } },
                { text: transcribePrompt() },
              ],
            },
          ],
          config: { thinkingConfig: textThinking(model) },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('masa tamat')), 20000)),
      ])
      const text = response.text?.trim()
      if (text) {
        const ayat = parseTranscript(text)
        if (ayat) return ayat
        lastError = 'Suara tidak jelas.'
        continue
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      console.warn(`Dengar ${model} tidak digunakan.`, lastError)
    }
  }
  throw new Error(lastError)
}

export async function speakAdvice(jawapan: string, langkah: string[]) {
  const spoken = penasihatSpoken(jawapan, langkah)
  const audio = await synthesizeMalay(spoken, 'lelaki')
  return { audio: audio.buffer.toString('base64'), mime: audio.mime }
}
