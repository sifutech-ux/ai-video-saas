import { GoogleGenAI, ThinkingLevel } from '@google/genai'

export const TEXT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash']

export function textThinking(model: string) {
  if (model.startsWith('gemini-2.')) return { thinkingBudget: 0 }
  if (/gemini-3\.[78]/.test(model)) return { thinkingLevel: ThinkingLevel.LOW }
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
  if (geminiBusy(message)) {
    return 'Penulis skrip sedang sibuk. Tunggu sebentar, kemudian tekan Buat iklan sekali lagi.'
  }
  const clean = message.replace(/\s+/g, ' ').trim()
  if (!clean || clean.startsWith('{') || /"code"\s*:/.test(clean)) {
    return 'Penulis skrip sedang sibuk. Tunggu sebentar, kemudian tekan Buat iklan sekali lagi.'
  }
  return clean.length > 180 ? `${clean.slice(0, 180)}…` : clean
}

export function geminiBusy(message: string) {
  return /503|UNAVAILABLE|high demand|currently experiencing|overloaded/i.test(message)
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

  const askOnce = async () => {
    let sawTimeout = false
    let sawBusy = false
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
        if (/masa tamat/.test(lastError)) sawTimeout = true
        if (geminiBusy(lastError)) sawBusy = true
        console.warn(`Gemini ${model} tidak digunakan.`, lastError)
      }
    }
    return sawBusy && !sawTimeout ? '' : null
  }

  const first = await askOnce()
  if (first) return first
  throw new Error(publicGeminiError(lastError))
}
