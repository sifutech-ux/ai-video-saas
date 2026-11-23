import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'

// Ashraf, the Malaysian Malay voice selected for the BeShare demos.
const voiceId = 'NHFTLozDZneDWyQjRGAO'

export function copilotElevenLabsKey() {
  return process.env.COPILOT_ELEVENLABS_API_KEY?.trim() || ''
}

export async function speakCopilot(text: string, abortSignal: AbortSignal) {
  const apiKey = copilotElevenLabsKey()
  if (!apiKey) throw new Error('voice_unavailable')

  const client = new ElevenLabsClient({ apiKey })
  const stream = await client.textToSpeech.convert(voiceId, {
    text,
    modelId: 'eleven_v4',
    languageCode: 'ms',
    outputFormat: 'mp3_44100_128',
    voiceSettings: { stability: 0.5, similarityBoost: 0.75 },
  }, { abortSignal, timeoutInSeconds: 20, maxRetries: 0 })
  const audio = Buffer.from(await new Response(stream).arrayBuffer())
  const hasMp3Header = audio.subarray(0, 3).toString() === 'ID3'
    || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)
  if (!hasMp3Header || audio.length < 64 || audio.length > 16_000_000) throw new Error('invalid_voice_audio')

  return { audio: audio.toString('base64'), mime: 'audio/mpeg', audioProvider: 'elevenlabs' }
}
