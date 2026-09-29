import { GoogleGenAI, Modality } from '@google/genai'

export const TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview']

export type PresenterVoice = 'lelaki' | 'perempuan'

export function presenterVoice(value: unknown): PresenterVoice {
  return value === 'perempuan' ? 'perempuan' : 'lelaki'
}

export function geminiVoiceName(voice: PresenterVoice) {
  return voice === 'perempuan' ? 'Kore' : 'Charon'
}

export const SPEECH_LANGUAGE = 'ms-MY'

export function malaySpeechConfig(voice: PresenterVoice) {
  return {
    languageCode: SPEECH_LANGUAGE,
    voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoiceName(voice) } },
  }
}

export function speechDirection(text: string, voice: PresenterVoice) {
  const tone =
    voice === 'perempuan'
      ? 'suara perempuan dewasa, nada tenang dan mesra'
      : 'suara lelaki dewasa, nada tenang dan mesra'
  return `Baca dalam loghat Malaysia, bukan Indonesia, ${tone}, sebutan jelas: ${text}`
}

export function speechScript(text: string, voice: PresenterVoice, model: string) {
  if (model.startsWith('gemini-3.8-')) return text
  return speechDirection(text, voice)
}

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

function languageRejected(error: unknown) {
  const text = error instanceof Error ? error.message : ''
  return /language code|unsupported language|LANGUAGE/i.test(text)
}

async function geminiSpeech(text: string, voice: PresenterVoice): Promise<SpokenAudio | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const ai = new GoogleGenAI({ apiKey: key })

  for (const model of TTS_MODELS) {
    const languages = [SPEECH_LANGUAGE, '']
    for (const languageCode of languages) {
      try {
        const speechConfig = languageCode
          ? malaySpeechConfig(voice)
          : { voiceConfig: malaySpeechConfig(voice).voiceConfig }
        const response = await Promise.race([
          ai.models.generateContent({
            model,
            contents: speechScript(text, voice, model),
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig,
            },
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('masa tamat')), 12000)),
        ])
        const part = response.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data)
        const raw = part?.inlineData?.data
        if (!raw) break
        const bytes = Buffer.from(raw, 'base64')
        if (bytes.length < 1000) break
        if (bytes.subarray(0, 4).toString() === 'RIFF') return { buffer: bytes, mime: 'audio/wav' }
        return { buffer: pcmToWav(bytes), mime: 'audio/wav' }
      } catch (error) {
        console.warn(`Suara ${model} tidak digunakan.`, error instanceof Error ? error.message : error)
        if (languageCode && languageRejected(error)) continue
        break
      }
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

export async function synthesizeMalay(text: string, voice: PresenterVoice = 'lelaki'): Promise<SpokenAudio> {
  const spoken = text.replace(/\s+/g, ' ').trim().slice(0, 800)
  if (!spoken) throw new Error('Sila sediakan skrip suara.')
  const gemini = await geminiSpeech(spoken, voice)
  if (gemini) return gemini
  if (voice === 'lelaki') {
    throw new Error('Suara lelaki tidak dapat dijana sekarang. Sila cuba sekali lagi.')
  }
  return translateSpeech(spoken)
}

export function audioDataUrl(audio: SpokenAudio) {
  const type = audio.mime === 'audio/wav' ? 'audio/wav' : 'audio/mp3'
  return `data:${type};base64,${audio.buffer.toString('base64')}`
}
