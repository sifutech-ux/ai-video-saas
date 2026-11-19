import assert from 'node:assert/strict'
import test from 'node:test'
import { POST, OPTIONS } from '../src/app/api/marketing/draf/route.ts'
import { POST as businessCopilot } from '../src/app/api/copilot/bijak/route.ts'
import { askMarketingOpenAIOnce, askOpenAIOnce, marketingOpenAIKey, speakOpenAI } from '../src/lib/copilot-openai.ts'

const MARKETING_KEY = 'synthetic-marketing-only'
const COPILOT_KEY = 'synthetic-copilot-only'
const TOKEN = 'Bearer synthetic-account-session'
const ORIGIN = 'https://beshareaisolution.com'
const ACCOUNT = 'https://akaun.beshareaisolution.com'
const reply = { jawapan: 'Kopi untuk hari anda.\nTanya pilihan yang tersedia.', langkah: [], format: 'pemasaran', cadangan: [] }
const context = { ok: true, hari: '2026-11-19', minggu_mula: '2026-11-16',
  ingatan: { ingatan: { produk: 'Latte daripada profil pelayan' }, versi: 2 },
  matlamat: null, pelan: null, angka: {} }
const session = () => ({ ok: true, akaun_id: 'a'.repeat(32), exp: Math.floor(Date.now() / 1000) + 3600,
  penasihat: { nama: 'Kedai Kopi Ujian', jualan: 'Kopi untuk pekerja pejabat', peringkat: 'jual' } })
const output = () => ({ status: 'completed', output: [{ type: 'message',
  content: [{ type: 'output_text', text: JSON.stringify(reply) }] }], usage: { input_tokens: 100, output_tokens: 60 } })
const envNames = ['MARKETING_OPENAI_API_KEY', 'COPILOT_OPENAI_API_KEY', 'OPENAI_API_KEY', 'COPILOT_AI_PROVIDER',
  'COPILOT_GEMINI_API_KEY', 'COPILOT_AKAUN_URL', 'COPILOT_AKAUN_HOST', 'COPILOT_KUTA_SECRET'] as const

async function isolated(run: () => Promise<void>) {
  const previous = Object.fromEntries(envNames.map(name => [name, process.env[name]]))
  const originalFetch = globalThis.fetch
  Object.assign(process.env, { MARKETING_OPENAI_API_KEY: MARKETING_KEY, COPILOT_OPENAI_API_KEY: COPILOT_KEY,
    OPENAI_API_KEY: 'synthetic-studio-only', COPILOT_AI_PROVIDER: 'openai', COPILOT_GEMINI_API_KEY: 'synthetic-gemini-only',
    COPILOT_AKAUN_URL: ACCOUNT, COPILOT_AKAUN_HOST: 'akaun.beshareaisolution.com', COPILOT_KUTA_SECRET: 'synthetic-quota-only' })
  globalThis.fetch = async () => { throw new Error('Unexpected network request in mocked test') }
  try { await run() } finally {
    globalThis.fetch = originalFetch
    for (const name of envNames) {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    }
  }
}

let requestNumber = 0
function request({ path = '/api/marketing/draf', token = TOKEN, origin = ORIGIN, extra = {} }:
  { path?: string; token?: string; origin?: string; extra?: Record<string, unknown> } = {}) {
  return new Request(`https://nasihat.beshareaisolution.com${path}`, { method: 'POST', headers: {
    origin, authorization: token, 'content-type': 'application/json',
    'idempotency-key': path === '/api/marketing/draf' ? 'marketing-draft-fixture-0001' : 'business-copilot-fixture-0001',
    'x-forwarded-for': `203.0.113.${++requestNumber}`,
  }, body: JSON.stringify({ giliran: [{ dari: 'klien', teks: 'Bantu siapkan satu draf pemasaran kopi.' }], ...extra }) })
}

function payload(options?: RequestInit) {
  return JSON.parse(typeof options?.body === 'string' ? options.body : Buffer.from(options?.body as Uint8Array).toString())
}

test('Marketing and existing Copilot text/speech select separate server credentials', () => isolated(async () => {
  process.env.MARKETING_OPENAI_API_KEY = `  ${MARKETING_KEY}  `
  assert.equal(marketingOpenAIKey(), MARKETING_KEY)
  const authorizations: string[] = []
  const budgets: number[] = []
  globalThis.fetch = async (url, options) => {
    authorizations.push(new Headers(options?.headers).get('authorization') || '')
    const body = payload(options)
    if (url === 'https://api.openai.com/v1/audio/speech') {
      const bytes = Buffer.alloc(64); bytes.write('RIFF'); bytes.write('WAVE', 8)
      return new Response(bytes)
    }
    assert.equal(url, 'https://api.openai.com/v1/responses')
    budgets.push(body.max_output_tokens)
    assert.equal(body.store, false)
    assert.equal(body.model, 'gpt-6-luna')
    assert.equal(options?.redirect, 'error')
    return Response.json(output())
  }
  await askMarketingOpenAIOnce('draf marketing')
  await askOpenAIOnce('copilot biasa')
  await askOpenAIOnce('copilot bijak', true)
  await speakOpenAI('Baca jawapan Copilot.')
  assert.deepEqual(authorizations, [`Bearer ${MARKETING_KEY}`, `Bearer ${COPILOT_KEY}`, `Bearer ${COPILOT_KEY}`, `Bearer ${COPILOT_KEY}`])
  assert.deepEqual(budgets, [3000, 1600, 3000])
}))

test('missing Marketing key never borrows Copilot, Studio or Gemini, and Copilot never borrows Marketing', () => isolated(async () => {
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json(output()) }
  for (const value of [undefined, '', ' \n ']) {
    if (value === undefined) delete process.env.MARKETING_OPENAI_API_KEY
    else process.env.MARKETING_OPENAI_API_KEY = value
    assert.equal(marketingOpenAIKey(), '')
    await assert.rejects(() => askMarketingOpenAIOnce('draf'), (error: Error) => error.message === 'provider_failed')
  }
  process.env.MARKETING_OPENAI_API_KEY = MARKETING_KEY
  delete process.env.COPILOT_OPENAI_API_KEY
  await assert.rejects(() => askOpenAIOnce('copilot'), (error: Error) => error.message === 'provider_failed')
  await assert.rejects(() => speakOpenAI('copilot'), (error: Error) => error.message === 'provider_failed')
  assert.equal(calls, 0)
}))

test('Marketing route authenticates, reads account context, settles shared quota and replays without another provider call', () => isolated(async () => {
  delete process.env.COPILOT_OPENAI_API_KEY
  const calls: string[] = [], credentials: string[] = []
  let replay = false
  globalThis.fetch = async (url, options) => {
    const target = new URL(String(url)), path = target.pathname
    calls.push(path.split('/').at(-1) || '')
    if (target.origin === ACCOUNT) assert.equal(new Headers(options?.headers).get('authorization'), TOKEN)
    if (path.endsWith('/sesi')) return Response.json(session())
    if (path.endsWith('/konteks')) return Response.json(context)
    if (path.endsWith('/rezab')) {
      const body = payload(options)
      assert.equal(body.route, 'copilot_nasihat')
      assert.match(body.idempotency_key, /^(marketing-draft|business-copilot)-fixture-0001$/)
      return Response.json(replay
        ? { ok: true, status: 'settled', rezab_id: 'b'.repeat(32), main_semula: true, ...reply }
        : { ok: true, status: 'reserved', rezab_id: 'b'.repeat(32) })
    }
    if (path.endsWith('/hantar')) return Response.json({ ok: true, status: 'sending' })
    if (path === '/v1/responses') {
      assert.equal(target.origin, 'https://api.openai.com')
      credentials.push(new Headers(options?.headers).get('authorization') || '')
      const body = payload(options)
      assert.match(body.input, /Latte daripada profil pelayan/)
      assert.doesNotMatch(body.input, /client-selected-secret|FORGED/)
      assert.equal(body.text.format.schema.properties.jawapan.maxLength, 4000)
      return Response.json(output())
    }
    if (path.endsWith('/muktamad')) {
      const body = payload(options)
      assert.equal(body.hasil, 'settled')
      assert.equal(body.model, 'gpt-6-luna')
      assert.equal(body.prompt_tokens, 100)
      assert.equal(body.output_tokens, 60)
      assert.equal(body.jawapan, reply.jawapan)
      assert.deepEqual(body.asas, { minggu_mula: context.minggu_mula, pelan_versi: 0, ingatan_versi: 2 })
      return Response.json({ ok: true, status: 'settled' })
    }
    throw new Error(`Unexpected mocked endpoint: ${path}`)
  }
  const response = await POST(request({ extra: { apiKey: 'client-selected-secret', MARKETING_OPENAI_API_KEY: 'client-selected-secret',
    provider: 'gemini', ingatan: { produk: 'FORGED' } } }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN)
  const result = await response.json()
  assert.equal(result.sumber, 'openai')
  assert.equal(result.bukan_model, false)
  assert.equal(result.jawapan, reply.jawapan)
  assert.deepEqual(calls, ['sesi', 'konteks', 'rezab', 'hantar', 'responses', 'muktamad'])

  process.env.COPILOT_OPENAI_API_KEY = COPILOT_KEY
  assert.equal((await businessCopilot(request({ path: '/api/copilot/bijak' }))).status, 200)
  assert.deepEqual(credentials, [`Bearer ${MARKETING_KEY}`, `Bearer ${COPILOT_KEY}`])

  replay = true; calls.length = 0
  const repeated = await POST(request())
  assert.equal(repeated.status, 200)
  const saved = await repeated.json()
  assert.equal(saved.sumber, 'tersimpan')
  assert.equal(saved.main_semula, true)
  assert.deepEqual(calls, ['sesi', 'konteks', 'rezab'])
  assert.equal(credentials.length, 2)
}))

test('Marketing route with no dedicated key stops before business context, quota or provider even with other keys present', () => isolated(async () => {
  process.env.COPILOT_AI_PROVIDER = 'gemini'
  const calls: string[] = []
  globalThis.fetch = async url => {
    calls.push(String(url))
    if (String(url) === `${ACCOUNT}/api/akaun/copilot/sesi`) return Response.json(session())
    throw new Error('Only session verification is allowed without a Marketing key')
  }
  for (const value of [undefined, ' \n ']) {
    if (value === undefined) delete process.env.MARKETING_OPENAI_API_KEY
    else process.env.MARKETING_OPENAI_API_KEY = value
    assert.equal((await POST(request({ extra: { apiKey: MARKETING_KEY } }))).status, 503)
  }
  assert.deepEqual(calls, Array(2).fill(`${ACCOUNT}/api/akaun/copilot/sesi`))
}))

test('Marketing rejects missing authentication, invalid sessions and foreign origins before quota or provider', () => isolated(async () => {
  const calls: string[] = []
  globalThis.fetch = async url => {
    calls.push(String(url))
    assert.equal(String(url), `${ACCOUNT}/api/akaun/copilot/sesi`)
    return Response.json({ ok: false }, { status: 401 })
  }
  assert.equal((await POST(request({ token: '' }))).status, 401)
  assert.equal(calls.length, 0)
  assert.equal((await POST(request({ origin: 'https://foreign.example.invalid' }))).status, 403)
  assert.equal(calls.length, 0)
  assert.equal((await POST(request())).status, 401)
  assert.equal(calls.length, 1)
}))

test('Marketing preflight permits the existing bearer and idempotency headers without a provider request', () => isolated(async () => {
  const response = await OPTIONS(new Request('https://nasihat.beshareaisolution.com/api/marketing/draf', {
    method: 'OPTIONS', headers: { origin: ORIGIN },
  }))
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN)
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS')
  assert.match(response.headers.get('access-control-allow-headers') || '', /Authorization, Idempotency-Key/)
  assert.equal(response.headers.get('cache-control'), 'no-store')
}))
