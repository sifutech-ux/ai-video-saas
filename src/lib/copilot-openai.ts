import { intelligenceSchema } from './copilot-intelligence'
type FailureReason = 'provider_failed' | 'uncertain' | 'http_error' | 'timeout' | 'transport'
  | 'output_limit' | 'incomplete' | 'response_invalid' | 'refusal' | 'empty_output' | 'invalid_audio'
/** Server-only OpenAI adapter. No provider retries: the account reservation owns each attempt. */
export class CopilotOpenAIError extends Error {
  readonly kind: 'provider_failed' | 'uncertain'
  readonly reason: FailureReason
  readonly httpStatus?: number
  readonly providerCode?: string
  constructor(kind: 'provider_failed' | 'uncertain', reason: FailureReason = kind, httpStatus?: number, providerCode?: string) {
    super(kind)
    this.name = 'CopilotOpenAIError'
    this.kind = kind
    this.reason = reason
    this.httpStatus = httpStatus
    this.providerCode = providerCode
  }
}

// Log only classifications chosen here. Provider messages can contain user data.
const providerCodes = new Set(['insufficient_quota', 'rate_limit_exceeded', 'invalid_api_key',
  'model_not_found', 'permission_denied', 'invalid_request_error', 'server_error',
  'context_length_exceeded', 'unsupported_parameter', 'invalid_json_schema',
  'billing_hard_limit_reached', 'budget_exceeded', 'content_policy_violation'])

function recordFailure(error: CopilotOpenAIError) {
  console.warn(JSON.stringify({ event: 'copilot_provider_failure', provider: 'openai',
    kind: error.kind, reason: error.reason,
    ...(error.httpStatus ? { http_status: error.httpStatus } : {}),
    ...(error.providerCode ? { provider_code: error.providerCode } : {}) }))
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
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      const code = typeof data?.error?.code === 'string' && providerCodes.has(data.error.code) ? data.error.code : 'other'
      throw new CopilotOpenAIError('provider_failed', 'http_error', response.status, code)
    }
    return await read(response)
  } catch (error) {
    const failure = controller.signal.aborted ? new CopilotOpenAIError('uncertain', 'timeout')
      : error instanceof CopilotOpenAIError ? error : new CopilotOpenAIError('uncertain', 'transport')
    recordFailure(failure)
    // A transport failure may happen after the provider accepted the request.
    throw failure
  } finally {
    clearTimeout(timer)
  }
}

export async function askOpenAIOnce(prompt: string, enhanced = false) {
  return request('responses', {
    model: 'gpt-6-luna', input: prompt, store: false,
    reasoning: { effort: 'low' },
    // Product contract: <=80 words plus three short actions. Includes reasoning tokens.
    max_output_tokens: enhanced ? 3000 : 1600,
    text: { verbosity: 'low', format: { type: 'json_schema', name: 'nasihat', strict: true, schema: enhanced ? intelligenceSchema : schema } },
  }, async (response) => {
    const data = await response.json()
    if (data?.status !== 'completed' || !Array.isArray(data.output)) {
      const reason = data?.status === 'incomplete'
        ? data.incomplete_details?.reason === 'max_output_tokens' ? 'output_limit' : 'incomplete'
        : 'response_invalid'
      throw new CopilotOpenAIError('provider_failed', reason)
    }
    const parts = data.output.filter((item: { type?: string }) => item.type === 'message')
      .flatMap((item: { content?: unknown[] }) => Array.isArray(item.content) ? item.content : [])
    if (parts.some((part: { type?: string }) => part.type === 'refusal')) throw new CopilotOpenAIError('provider_failed', 'refusal')
    const text = parts.filter((part: { type?: string; text?: unknown }) => part.type === 'output_text' && typeof part.text === 'string')
      .map((part: { text: string }) => part.text).join('').trim()
    if (!text) throw new CopilotOpenAIError('provider_failed', 'empty_output')
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
    if (bytes.length < 44 || bytes.length > 32_000_000 || bytes.subarray(0, 4).toString() !== 'RIFF'
      || bytes.subarray(8, 12).toString() !== 'WAVE') throw new CopilotOpenAIError('provider_failed', 'invalid_audio')
    return { audio: bytes.toString('base64'), mime: 'audio/wav' }
  })
}
