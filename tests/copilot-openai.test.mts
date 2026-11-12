import assert from 'node:assert/strict'
import test from 'node:test'
import { askOpenAIOnce, speakOpenAI } from '../src/lib/copilot-openai.ts'
import { askCopilotOnce, copilotKeyPresent } from '../src/lib/copilot-model.ts'
import { POST as voice, OPTIONS as voiceOptions } from '../src/app/api/penasihat-suara/route.ts'
import { POST as advice } from '../src/app/api/copilot/nasihat/route.ts'

const answer = { jawapan: 'Uji satu tawaran kopi untuk pekerja pejabat.', langkah: ['Pilih satu produk.', 'Tanya lima pelanggan.', 'Catat respons mereka.'] }
const result = () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }], usage: { input_tokens: 100, output_tokens: 60 } })
const session = () => ({ ok: true, akaun_id: 'a'.repeat(32), exp: Math.floor(Date.now()/1000) + 3600, penasihat: { nama: 'Kedai Kopi Ujian', jualan: 'Kopi untuk pekerja pejabat', peringkat: 'mula' } })
const envNames = ['COPILOT_AI_PROVIDER','COPILOT_OPENAI_API_KEY','OPENAI_API_KEY','COPILOT_AKAUN_URL','COPILOT_AKAUN_HOST','COPILOT_KUTA_SECRET'] as const
async function isolated(fn: () => Promise<void>) {
  const env = Object.fromEntries(envNames.map(k => [k, process.env[k]]))
  const originalFetch = globalThis.fetch
  process.env.COPILOT_AI_PROVIDER = 'openai'
  process.env.COPILOT_OPENAI_API_KEY = 'synthetic-secret'
  process.env.COPILOT_AKAUN_URL = 'https://akaun.beshareaisolution.com'
  process.env.COPILOT_AKAUN_HOST = 'akaun.beshareaisolution.com'
  process.env.COPILOT_KUTA_SECRET = 'synthetic-quota-secret'
  try { await fn() } finally {
    globalThis.fetch = originalFetch
    for (const k of envNames) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k] }
  }
}

test('OpenAI sends one stateless structured request and maps usage without Google headers', () => isolated(async () => {
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls++
    assert.equal(url, 'https://api.openai.com/v1/responses')
    assert.equal(options?.redirect, 'error')
    assert.equal((options?.headers as Record<string,string>).Authorization, 'Bearer synthetic-secret')
    assert.equal(JSON.stringify(options?.headers).includes('google'), false)
    const body = JSON.parse(options?.body as string)
    assert.equal(body.store, false)
    assert.equal(body.model, 'gpt-6-luna')
    assert.equal(body.input, 'soalan sintetik')
    assert.equal(body.reasoning.effort, 'low')
    assert.equal(body.text.format.strict, true)
    assert.equal(body.text.format.schema.properties.langkah.maxItems, 3)
    return Response.json(result())
  }
  const data = await askCopilotOnce('soalan sintetik')
  assert.equal(data.text, JSON.stringify(answer))
  assert.equal(data.promptTokens, 100)
  assert.equal(data.outputTokens, 60)
  assert.equal('provider' in data && data.provider, 'openai')
  assert.equal(calls, 1)
}))

test('missing Copilot key never borrows Studio key or makes a request', () => isolated(async () => {
  delete process.env.COPILOT_OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'studio-private-key'
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json(result()) }
  assert.equal(copilotKeyPresent(), false)
  await assert.rejects(() => askOpenAIOnce('hello'))
  assert.equal(calls, 0)
  process.env.COPILOT_AI_PROVIDER = 'misspelled-provider'
  assert.equal(copilotKeyPresent(), false)
  await assert.rejects(() => askCopilotOnce('hello'))
  assert.equal(calls, 0)
}))

test('incomplete, refusal, empty and HTTP errors never become successful advice or retry', () => isolated(async () => {
  for (const data of [{ ...result(), status: 'incomplete' }, { status: 'completed', output: [] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }, null]) {
    let calls = 0
    globalThis.fetch = async () => { calls++; return data ? Response.json(data) : new Response('synthetic-secret must not escape', { status: 429 }) }
    await assert.rejects(() => askOpenAIOnce('hello'), (error: Error) => error.message === 'provider_failed')
    assert.equal(calls, 1)
  }
  globalThis.fetch = async () => { throw new Error('synthetic-secret socket failed') }
  await assert.rejects(() => askOpenAIOnce('hello'), (error: Error) => error.message === 'uncertain')
}))

test('OpenAI advice traverses session, quota, provider and settlement; replay calls no provider', () => isolated(async () => {
  const calls: string[] = []
  let replay = false
  globalThis.fetch = async (url, options) => {
    const path = new URL(String(url)).pathname
    calls.push(path)
    if (path.endsWith('/sesi')) return Response.json(session())
    if (path.endsWith('/rezab')) return Response.json(replay
      ? { ok: true, status: 'settled', rezab_id: 'rezab-openai-01', main_semula: true, ...answer }
      : { ok: true, status: 'reserved', rezab_id: 'rezab-openai-01' })
    if (path.endsWith('/hantar')) return Response.json({ ok: true, status: 'sending' })
    if (path === '/v1/responses') return Response.json(result())
    if (path.endsWith('/muktamad')) {
      const body = JSON.parse(Buffer.from(options?.body as Uint8Array).toString())
      assert.equal(body.hasil, 'settled')
      assert.equal(body.model, 'gpt-6-luna')
      assert.equal(body.prompt_tokens, 100)
      assert.equal(body.output_tokens, 60)
      assert.deepEqual(body.langkah, answer.langkah)
      return Response.json({ ok: true, status: 'settled' })
    }
    throw new Error(`unexpected path: ${path}`)
  }
  const req = () => new Request('https://nasihat.beshareaisolution.com/api/copilot/nasihat', { method: 'POST', headers: { origin: 'https://beshareaisolution.com', authorization: 'Bearer synthetic-token', 'idempotency-key': 'openai-integration-01', 'content-type':'application/json', 'x-forwarded-for':'203.0.113.90' }, body: JSON.stringify({ giliran: [{ dari: 'klien', teks: 'Bagaimana saya boleh menguji tawaran kopi?' }] }) })
  const response = await advice(req())
  assert.equal(response.status, 200)
  assert.equal((await response.json()).sumber, 'openai')
  assert.deepEqual(calls.map(x => x.split('/').at(-1)), ['sesi','rezab','hantar','responses','muktamad'])
  replay = true; calls.length = 0
  const repeated = await advice(req())
  assert.equal(repeated.status, 200)
  const body = await repeated.json()
  assert.equal(body.main_semula, true)
  assert.equal(body.sumber, 'tersimpan')
  assert.deepEqual(calls.map(x => x.split('/').at(-1)), ['sesi','rezab'])
}))

test('speech requires valid account before generating WAV and accepts authenticated CORS', () => isolated(async () => {
  const bytes = Buffer.alloc(2000); bytes.write('RIFF'); bytes.write('WAVE', 8)
  let paid = 0
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/sesi')) return Response.json(session())
    assert.equal(url, 'https://api.openai.com/v1/audio/speech')
    const body = JSON.parse(options?.body as string)
    assert.equal(body.voice, 'cedar')
    assert.ok(body.input.includes(answer.jawapan))
    paid++
    return new Response(bytes, { headers: { 'content-type':'audio/wav' } })
  }
  const req = (token = '') => new Request('https://nasihat.beshareaisolution.com/api/penasihat-suara', { method: 'POST', headers: { origin:'https://beshareaisolution.com', authorization:token, 'content-type':'application/json', 'x-forwarded-for':'203.0.113.91' }, body:JSON.stringify(answer) })
  assert.equal((await voice(req())).status, 401)
  assert.equal(paid, 0)
  const response = await voice(req('Bearer synthetic-token'))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(Buffer.from(body.audio,'base64'), bytes)
  assert.equal(body.mime, 'audio/wav')
  assert.equal(paid, 1)
  const preflight = await voiceOptions(new Request('https://nasihat.beshareaisolution.com/api/penasihat-suara', { headers:{origin:'https://beshareaisolution.com'} }))
  assert.match(preflight.headers.get('access-control-allow-headers') || '', /Authorization/)
  globalThis.fetch = async () => new Response('not an audio file')
  await assert.rejects(() => speakOpenAI('hello'), (error: Error) => error.message === 'provider_failed')
}))
