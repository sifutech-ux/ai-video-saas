/** Server-only OpenAI adapter. No provider retries: the account reservation owns each attempt. */
export class CopilotOpenAIError extends Error {
  readonly kind: 'provider_failed' | 'uncertain'
  constructor(kind: 'provider_failed' | 'uncertain') {
    super(kind)
    this.name = 'CopilotOpenAIError'
    this.kind = kind
  }
}

export function copilotOpenAIKey() {
  // Deliberately do not borrow Studio's OPENAI_API_KEY implicitly.
  return process.env.COPILOT_OPENAI_API_KEY?.trim() || ''
}

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    jawapan: { type: 'string' },
    langkah: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
  },
  required: ['jawapan', 'langkah'],
}

function whole(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

async function request<T>(path: string, body: unknown, read: (response: Response) => Promise<T>): Promise<T> {
  const key = copilotOpenAIKey()
  if (!key) throw new CopilotOpenAIError('provider_failed')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 22_000)
  try {
    const response = await fetch(`https://api.openai.com/v1/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error', cache: 'no-store', signal: controller.signal,
    })
    if (!response.ok) throw new CopilotOpenAIError('provider_failed')
    return await read(response)
  } catch (error) {
    if (controller.signal.aborted) throw new CopilotOpenAIError('uncertain')
    if (error instanceof CopilotOpenAIError) throw error
    // A transport failure may happen after the provider accepted the request.
    throw new CopilotOpenAIError('uncertain')
  } finally {
    clearTimeout(timer)
  }
}

export async function askOpenAIOnce(prompt: string) {
  return request('responses', {
    model: 'gpt-6-luna', input: prompt, store: false,
    reasoning: { effort: 'low' },
    // Product contract: <=80 words plus three short actions. Includes reasoning tokens.
    max_output_tokens: 1600,
    text: { verbosity: 'low', format: { type: 'json_schema', name: 'nasihat', strict: true, schema } },
  }, async (response) => {
    const data = await response.json()
    if (data.status !== 'completed' || !Array.isArray(data.output)) throw new CopilotOpenAIError('provider_failed')
    const parts = data.output.filter((item: { type?: string }) => item.type === 'message')
      .flatMap((item: { content?: unknown[] }) => Array.isArray(item.content) ? item.content : [])
    if (parts.some((part: { type?: string }) => part.type === 'refusal')) throw new CopilotOpenAIError('provider_failed')
    const text = parts.filter((part: { type?: string; text?: unknown }) => part.type === 'output_text' && typeof part.text === 'string')
      .map((part: { text: string }) => part.text).join('').trim()
    if (!text) throw new CopilotOpenAIError('provider_failed')
    return { text, model: 'gpt-6-luna', provider: 'openai' as const,
      promptTokens: whole(data.usage?.input_tokens), outputTokens: whole(data.usage?.output_tokens) }
  })
}

export async function speakOpenAI(text: string) {
  // Existing buffered speech contract. Replace before Speech API shutdown on 2027-01-06.
  return request('audio/speech', {
    model: 'gpt-4o-mini-tts', voice: 'cedar', input: text,
    response_format: 'wav',
    instructions: 'Baca tepat teks yang diberi dalam Bahasa Melayu Malaysia. Suara tenang, mesra dan jelas. Jangan tambah ayat.',
  }, async (response) => {
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length < 44 || bytes.length > 8_000_000 || bytes.subarray(0, 4).toString() !== 'RIFF'
      || bytes.subarray(8, 12).toString() !== 'WAVE') throw new CopilotOpenAIError('provider_failed')
    return { audio: bytes.toString('base64'), mime: 'audio/wav' }
  })
}
