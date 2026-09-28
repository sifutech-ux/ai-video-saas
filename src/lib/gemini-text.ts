import { GoogleGenAI, ThinkingLevel } from '@google/genai'

export const TEXT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash']

export function textThinking(model: string) {
  if (model.startsWith('gemini-2.')) return { thinkingBudget: 0 }
  return { thinkingLevel: ThinkingLevel.MINIMAL }
}

export function geminiKey() {
  return process.env.GEMINI_API_KEY || ''
}

export function publicGeminiError(message: string) {
  if (!geminiKey()) {
    return 'Kunci Gemini belum ditetapkan. Dalam Vercel, tambah GEMINI_API_KEY, kemudian Redeploy.'
  }
  if (/API key not valid|API_KEY_INVALID|permission denied/i.test(message)) {
    return 'Kunci Gemini ditolak. Semak GEMINI_API_KEY pada Vercel, kemudian Redeploy.'
  }
  if (/no longer available|NOT_FOUND|not found|is not found/i.test(message)) {
    return 'Penulis skrip Gemini tidak tersedia. Tekan Buat iklan sekali lagi.'
  }
  if (/429|quota|resource exhausted|RESOURCE_EXHAUSTED/i.test(message)) {
    return 'Kuota Gemini penuh sebentar. Tunggu seminit, kemudian tekan sekali lagi.'
  }
  const clean = message.replace(/\s+/g, ' ').trim()
  return clean ? (clean.length > 180 ? `${clean.slice(0, 180)}…` : clean) : 'Gemini tidak memulangkan jawapan.'
}

export function parseStoryboard(text: string) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Gemini tidak memulangkan papan cerita.')
  const data = JSON.parse(text.slice(start, end + 1)) as {
    title?: string
    scenes?: Array<{ sceneNumber?: number; type?: string; scriptMalay?: string }>
  }
  if (!data.title || !Array.isArray(data.scenes) || data.scenes.length < 2) {
    throw new Error('Papan cerita tidak lengkap. Tekan sekali lagi.')
  }
  return data
}

export async function askGemini(prompt: string, options: { json?: boolean; timeoutMs?: number } = {}) {
  const key = geminiKey()
  if (!key) throw new Error(publicGeminiError(''))
  const ai = new GoogleGenAI({ apiKey: key })
  const timeoutMs = options.timeoutMs ?? 15000
  let lastError = 'Gemini tidak memulangkan jawapan.'

  for (const model of TEXT_MODELS) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            ...(options.json ? { responseMimeType: 'application/json' } : {}),
            thinkingConfig: textThinking(model),
          },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('masa tamat')), timeoutMs)),
      ])
      const text = response.text?.trim()
      if (text) return text
      lastError = `${model} memulangkan jawapan kosong.`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      console.warn(`Gemini ${model} tidak digunakan.`, lastError)
    }
  }

  throw new Error(publicGeminiError(lastError))
}
