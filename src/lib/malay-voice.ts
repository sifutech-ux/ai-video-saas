import { GoogleGenAI, Modality } from '@google/genai'

const TTS_MODELS = ['gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts']

export function speechChunks(text: string, max = 180) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const sentences = clean.split(/(?<=[.!?…])\s+/)
  const chunks: string[] = []
  let current = ''

  const pushLong = (value: string) => {
    for (let index = 0; index < value.length; index += max) {
      chunks.push(value.slice(index, index + max).trim())
    }
  }

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence
    if (next.length <= max) {
      current = next
      continue
    }
    if (current) chunks.push(current.trim())
    if (sentence.length > max) {
      pushLong(sentence)
      current = ''
    } else {
      current = sentence
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(Boolean)
}

export function pcmToWav(pcm: Buffer, sampleRate = 24000) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export type SpokenAudio = {
  buffer: Buffer
  mime: 'audio/wav' | 'audio/mpeg'
}

async function geminiSpeech(text: string): Promise<SpokenAudio | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const ai = new GoogleGenAI({ apiKey: key })

  for (const model of TTS_MODELS) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: `Baca iklan ini dalam Bahasa Malaysia, suara mesra dan jelas: ${text}`,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
          },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('masa tamat')), 20000)),
      ])
      const part = response.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data)
      const raw = part?.inlineData?.data
      if (!raw) continue
      const bytes = Buffer.from(raw, 'base64')
      if (bytes.length < 1000) continue
      if (bytes.subarray(0, 4).toString() === 'RIFF') return { buffer: bytes, mime: 'audio/wav' }
      return { buffer: pcmToWav(bytes), mime: 'audio/wav' }
    } catch (error) {
      console.warn(`Suara ${model} tidak digunakan.`, error instanceof Error ? error.message : error)
    }
  }
  return null
}

async function translateSpeech(text: string): Promise<SpokenAudio> {
  const chunks = speechChunks(text)
  if (chunks.length === 0) throw new Error('Sila sediakan skrip suara.')
  const parts: Buffer[] = []
  for (const chunk of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=ms&client=tw-ob`
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!response.ok) throw new Error('Suara Bahasa Malaysia tidak dapat dijana.')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length < 200) throw new Error('Suara Bahasa Malaysia tidak dapat dijana.')
    parts.push(bytes)
  }
  return { buffer: Buffer.concat(parts), mime: 'audio/mpeg' }
}

export async function synthesizeMalay(text: string): Promise<SpokenAudio> {
  const spoken = text.replace(/\s+/g, ' ').trim().slice(0, 800)
  if (!spoken) throw new Error('Sila sediakan skrip suara.')
  const gemini = await geminiSpeech(spoken)
  if (gemini) return gemini
  return translateSpeech(spoken)
}

export function audioDataUrl(audio: SpokenAudio) {
  const type = audio.mime === 'audio/wav' ? 'audio/wav' : 'audio/mp3'
  return `data:${type};base64,${audio.buffer.toString('base64')}`
}
