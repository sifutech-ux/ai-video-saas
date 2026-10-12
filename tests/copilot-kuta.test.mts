import assert from 'node:assert/strict'
import test from 'node:test'
import { accountEndpoint, copilotSignature, createKuotaClient } from '../src/lib/copilot-kuta.ts'
import { askCopilotOnce, askPublicOnce, copilotRuntime } from '../src/lib/copilot-model.ts'

const BADAN = new TextEncoder().encode(
  '{"route":"copilot_nasihat","idempotency_key":"idem-copilot-0001","giliran":[{"dari":"klien","teks":"Macam mana nak mula?"}]}',
)
const VEKTOR = '7e287c1afa32c967f45fa149021f229dd1e1eeaed4899ce037233137365f669b'

test('tandatangan hmac sepadan dengan perkhidmatan akaun', () => {
  const sig = copilotSignature('kuta-ujian', 'POST', '/api/akaun/copilot/kuota/rezab', BADAN, 1_700_000_000, 'nonce-ujian-000001')
  assert.equal(sig, VEKTOR)
})

test('hos produksi ditolak jika bukan https tepat', () => {
  const host = 'https://beshare-ipo-bot.onrender.com'
  assert.equal(accountEndpoint(host, '/api/akaun/copilot/sesi'), `${host}/api/akaun/copilot/sesi`)
  for (const bad of [
    'http://beshare-ipo-bot.onrender.com',
    'https://beshare-ipo-bot.onrender.com:8443',
    'https://user:rahsia@beshare-ipo-bot.onrender.com',
    'https://beshare-ipo-bot.onrender.com/api',
    'https://beshare-ipo-bot.onrender.com/?token=rahsia',
    'https://10.1.2.3',
    'https://192.168.1.9',
    'https://172.16.0.4',
    'http://localhost:8767',
    'http://127.0.0.1:8767',
    'https://akaun.example',
  ]) {
    assert.equal(accountEndpoint(bad, '/api/akaun/copilot/sesi'), null, bad)
  }
  const nodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'
  try {
    assert.equal(accountEndpoint('http://127.0.0.1:8767', '/api/akaun/copilot/kuota/rezab', true), 'http://127.0.0.1:8767/api/akaun/copilot/kuota/rezab')
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = nodeEnv
  }
  process.env.NODE_ENV = 'production'
  try {
    assert.equal(accountEndpoint('http://127.0.0.1:8767', '/api/akaun/copilot/kuota/rezab', true), null)
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = nodeEnv
  }
})

test('klien kuota menandatangani badan dan gagal tertutup', async () => {
  const masaDijangka = 1_700_000_000
  const calls: Array<{ url: string; redirect?: RequestRedirect; auth?: string; masa: string; nonce: string; sig: string; body: string }> = []
  const client = createKuotaClient({
    akaunUrl: 'https://beshare-ipo-bot.onrender.com',
    secret: 'kuta-ujian',
    authorization: 'Bearer token-ujian',
    now: () => 1_700_000_000_000,
    fetchImpl: async (url, init) => {
      const raw = Buffer.from(init?.body as Uint8Array)
      const headers = init?.headers as Record<string, string>
      calls.push({
        url: String(url),
        redirect: init?.redirect,
        auth: headers.Authorization,
        masa: headers['X-Copilot-Masa'],
        nonce: headers['X-Copilot-Nonce'],
        sig: headers['X-Copilot-Tandatangan'],
        body: raw.toString(),
      })
      return Response.json({ ok: true, rezab_id: 'rezab-ujian-0001', status: 'reserved' })
    },
  })
  const result = await client.rezab({
    route: 'copilot_nasihat',
    idempotencyKey: 'idem-copilot-0001',
    giliran: [{ dari: 'klien', teks: 'Macam mana nak mula?' }],
    nama: 'Jangan hantar',
  })
  assert.equal(result.ok, true)
  assert.equal(calls[0].masa, String(masaDijangka))
  assert.equal(
    calls[0].sig,
    copilotSignature('kuta-ujian', 'POST', new URL(calls[0].url).pathname, BADAN, masaDijangka, calls[0].nonce),
  )
  assert.equal(calls[0].body, new TextDecoder().decode(BADAN))
  assert.equal(calls[0].redirect, 'error')
  assert.equal(calls[0].auth, 'Bearer token-ujian')
  assert.equal(calls[0].body.includes('Jangan hantar'), false)
  assert.equal(calls[0].body.includes('akaun_id'), false)

  const putus = createKuotaClient({
    akaunUrl: 'http://beshare-ipo-bot.onrender.com',
    secret: 'kuta-ujian',
    fetchImpl: async () => {
      throw new Error('rangkaian tidak patut')
    },
  })
  const gagal = await putus.rezab({
    route: 'copilot_nasihat',
    idempotencyKey: 'idem-copilot-0001',
    giliran: [{ dari: 'klien', teks: 'Macam mana nak mula?' }],
  })
  assert.equal(gagal.ok, false)
  assert.equal(gagal.status, 503)
})

test('kunci copilot tidak jatuh ke kunci studio', async () => {
  const studio = process.env.GEMINI_API_KEY
  const copilot = process.env.COPILOT_GEMINI_API_KEY
  process.env.GEMINI_API_KEY = 'kunci-studio-bukan-panggilan'
  delete process.env.COPILOT_GEMINI_API_KEY
  let called = 0
  const original = copilotRuntime.generate
  copilotRuntime.generate = async () => {
    called += 1
    throw new Error('model tidak patut')
  }
  try {
    await assert.rejects(askCopilotOnce('Arahan ujian.'), (error) => error && typeof error === 'object' && 'kind' in error && error.kind === 'tiada_kunci')
    assert.equal(called, 0)
    assert.equal(askCopilotOnce.toString().includes('process.env.GEMINI_API_KEY'), false)
    assert.equal(askCopilotOnce.toString().includes('process.env.COPILOT_GEMINI_API_KEY'), true)
    assert.equal(askPublicOnce.toString().includes('process.env.GEMINI_API_KEY'), true)
  } finally {
    copilotRuntime.generate = original
    if (studio === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = studio
    if (copilot === undefined) delete process.env.COPILOT_GEMINI_API_KEY
    else process.env.COPILOT_GEMINI_API_KEY = copilot
  }
})
