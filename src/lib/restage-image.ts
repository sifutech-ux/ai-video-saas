import { GoogleGenAI, Modality } from '@google/genai'
import { geminiKey } from '@/lib/gemini-text'

const IMAGE_MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image']

export async function restageImage(dataUrl: string, instruction: string) {
  const key = geminiKey()
  if (!key || !dataUrl.startsWith('data:')) return null
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim())
  if (!match) return null
  const ai = new GoogleGenAI({ apiKey: key })

  for (const model of IMAGE_MODELS) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: match[1], data: match[2].replace(/\s/g, '') } },
                { text: instruction },
              ],
            },
          ],
          config: {
            responseModalities: [Modality.TEXT, Modality.IMAGE],
            imageConfig: { aspectRatio: '9:16', imageSize: '1K', personGeneration: 'ALLOW_ADULT' },
          },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('masa tamat')), 25000)),
      ])
      const parts = response.candidates?.[0]?.content?.parts ?? []
      const image = parts.find((part) => part.inlineData?.data && (part.inlineData.mimeType || '').startsWith('image/'))
      if (!image?.inlineData?.data) continue
      const mime = image.inlineData.mimeType || 'image/png'
      return `data:${mime};base64,${image.inlineData.data}`
    } catch (error) {
      console.warn(`Scene ${model} tidak digunakan.`, error instanceof Error ? error.message : error)
    }
  }
  return null
}
