import assert from 'node:assert/strict'
import test from 'node:test'
import { OPTIONS, POST } from '../src/app/api/copilot/nasihat/route.ts'
import { copilotSignature } from '../src/lib/copilot-kuta.ts'
import { copilotRuntime } from '../src/lib/copilot-model.ts'

const AKAUN = 'https://beshare-ipo-bot.onrender.com'
const MODEL = '{"jawapan":"Tulis satu ayat tawaran.","langkah":["Senaraikan sepuluh orang.","Mesej tiga orang.","Tetapkan cara bayar."]}'
const KUNCI = 'idem-copilot-http-01'

function soalan() {
  return new Request('https://beshareaisolution.com/api/copilot/nasihat', {
    method: 'POST',
    headers: {
      origin: 'https://beshareaisolution.com',
      'content-type': 'application/json',
      authorization: 'Bearer token-ujian-bukan-rahsia',
      'idempotency-key': KUNCI,
      'x-forwarded-for': '203.0.113.40',
    },
    body: JSON.stringify({
      user_id: 'b'.repeat(32),
      nama: 'Syarikat Palsu',
      giliran: [{ dari: 'klien', teks: 'Macam mana nak mula?' }],
    }),
  })
}

function sesi() {
  return {
    ok: true,
    akaun_id: 'ab12cd34ef56ab78ab12cd34ef56ab78',
    exp: 1_900_000_000,
    penasihat: {
      nama: 'Kedai Amanah',
      jualan: 'Kuih kering untuk pejabat kecil',
      peringkat: 'mula',
    },
  }
}

test('laluan http copilot memanggil model sekali selepas kuota', async () => {
  const previousFetch = globalThis.fetch
  const previous = {
    akaun: process.env.COPILOT_AKAUN_URL,
    kuta: process.env.COPILOT_KUTA_SECRET,
    kunci: process.env.COPILOT_GEMINI_API_KEY,
    studio: process.env.GEMINI_API_KEY,
  }
  process.env.COPILOT_AKAUN_URL = AKAUN
  process.env.COPILOT_KUTA_SECRET = 'kuta-ujian'
  process.env.COPILOT_GEMINI_API_KEY = 'ujian-bukan-panggilan'
  process.env.GEMINI_API_KEY = 'kunci-studio-bukan-panggilan'
  let model = 0
  const original = copilotRuntime.generate
  copilotRuntime.generate = async () => {
    model += 1
    return { text: MODEL, model: 'gemini-3.5-flash-lite', promptTokens: null, outputTokens: 4 }
  }
  const calls: string[] = []
  globalThis.fetch = async (url, init) => {
    const href = String(url)
    calls.push(href)
    assert.equal(init?.redirect, 'error')
    if (href.endsWith('/sesi')) {
      assert.equal((init?.headers as { Authorization: string }).Authorization, 'Bearer token-ujian-bukan-rahsia')
      return Response.json(sesi())
    }
    const raw = Buffer.from(init?.body as Uint8Array)
    const headers = init?.headers as Record<string, string>
    const path = new URL(href).pathname
    assert.equal(headers['X-Copilot-Tandatangan'], copilotSignature('kuta-ujian', 'POST', path, raw, Number(headers['X-Copilot-Masa']), headers['X-Copilot-Nonce']))
    assert.equal(raw.toString().includes('Syarikat Palsu'), false)
    if (path.endsWith('/rezab')) return Response.json({ ok: true, rezab_id: 'rezab-http-0001', status: 'reserved' })
    if (path.endsWith('/hantar')) return Response.json({ ok: true, status: 'sending', rezab_id: 'rezab-http-0001' })
    if (path.endsWith('/muktamad')) {
      const data = JSON.parse(raw.toString()) as { hasil?: string; jawapan?: string; output_tokens?: number }
      assert.equal(data.hasil, 'settled')
      assert.equal(data.output_tokens, 4)
      assert.equal(data.jawapan, 'Tulis satu ayat tawaran.')
      return Response.json({ ok: true, status: 'settled' })
    }
    return new Response('tidak', { status: 500 })
  }
  try {
    const response = await POST(soalan())
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.sumber, 'gemini')
    assert.equal(body.bukan_model, false)
    assert.equal(model, 1)
    assert.equal(calls.some((url) => url.includes('generativelanguage') || url.includes('googleapis')), false)
    assert.equal(calls.filter((url) => url.endsWith('/rezab')).length, 1)
  } finally {
    globalThis.fetch = previousFetch
    copilotRuntime.generate = original
    restore(previous)
  }
})

test('laluan http gagal tertutup tanpa model bila kunci atau kuota tiada', async () => {
  const previousFetch = globalThis.fetch
  const previous = {
    akaun: process.env.COPILOT_AKAUN_URL,
    kuta: process.env.COPILOT_KUTA_SECRET,
    kunci: process.env.COPILOT_GEMINI_API_KEY,
    studio: process.env.GEMINI_API_KEY,
  }
  process.env.COPILOT_AKAUN_URL = AKAUN
  process.env.COPILOT_KUTA_SECRET = 'kuta-ujian'
  process.env.GEMINI_API_KEY = 'kunci-studio-bukan-panggilan'
  delete process.env.COPILOT_GEMINI_API_KEY
  let model = 0
  const original = copilotRuntime.generate
  copilotRuntime.generate = async () => {
    model += 1
    throw new Error('model tidak patut')
  }
  let kuota = 0
  globalThis.fetch = async (url) => {
    if (String(url).includes('/kuota/')) kuota += 1
    if (String(url).endsWith('/sesi')) return Response.json(sesi())
    throw new Error('kuota tidak patut')
  }
  try {
    const tiada = await POST(soalan())
    const badanTiada = await tiada.json()
    assert.equal(tiada.status, 503)
    assert.equal(badanTiada.ok, undefined)
    assert.equal(model, 0)
    assert.equal(kuota, 0)

    process.env.COPILOT_GEMINI_API_KEY = 'ujian-bukan-panggilan'
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/sesi')) return Response.json(sesi())
      if (String(url).endsWith('/rezab')) return Response.json({ ok: false, ralat: 'menunggu' }, { status: 409 })
      throw new Error('model atau hantar tidak patut')
    }
    const proses = await POST(soalan())
    assert.equal(proses.status, 409)
    assert.equal(model, 0)

    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/sesi')) return Response.json(sesi())
      throw new Error('pangkalan data tutup')
    }
    const putus = await POST(soalan())
    const badanPutus = await putus.json()
    assert.equal(putus.status, 503)
    assert.equal(badanPutus.ok, undefined)
    assert.equal(model, 0)
  } finally {
    globalThis.fetch = previousFetch
    copilotRuntime.generate = original
    restore(previous)
  }
})

test('simpanan gagal selepas model tidak mengulang dan tidak memulangkan jawapan', async () => {
  const previousFetch = globalThis.fetch
  const previous = {
    akaun: process.env.COPILOT_AKAUN_URL,
    kuta: process.env.COPILOT_KUTA_SECRET,
    kunci: process.env.COPILOT_GEMINI_API_KEY,
    studio: process.env.GEMINI_API_KEY,
  }
  process.env.COPILOT_AKAUN_URL = AKAUN
  process.env.COPILOT_KUTA_SECRET = 'kuta-ujian'
  process.env.COPILOT_GEMINI_API_KEY = 'ujian-bukan-panggilan'
  delete process.env.GEMINI_API_KEY
  let model = 0
  let muktamad = 0
  const original = copilotRuntime.generate
  copilotRuntime.generate = async () => {
    model += 1
    return { text: MODEL, model: 'gemini-3.5-flash-lite', promptTokens: 2, outputTokens: 4 }
  }
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.endsWith('/sesi')) return Response.json(sesi())
    if (href.endsWith('/rezab')) return Response.json({ ok: true, rezab_id: 'rezab-http-0001', status: 'reserved' })
    if (href.endsWith('/hantar')) return Response.json({ ok: true, status: 'sending' })
    if (href.endsWith('/muktamad')) {
      muktamad += 1
      return Response.json({ ok: false, ralat: 'kuota_tidak_sedia' }, { status: 503 })
    }
    return new Response('tidak', { status: 500 })
  }
  try {
    const response = await POST(soalan())
    const body = await response.json()
    assert.equal(response.status, 503)
    assert.equal(body.ok, undefined)
    assert.equal(JSON.stringify(body).includes('Tulis satu ayat'), false)
    assert.equal(model, 1)
    assert.equal(muktamad, 3)
  } finally {
    globalThis.fetch = previousFetch
    copilotRuntime.generate = original
    restore(previous)
  }
})

test('preflight nasihat membenarkan idempotency-key', async () => {
  const response = await OPTIONS(new Request('https://beshareaisolution.com/api/copilot/nasihat', {
    method: 'OPTIONS',
    headers: {
      origin: 'https://beshareaisolution.com',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type, authorization, idempotency-key',
    },
  }))
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://beshareaisolution.com')
  assert.match(response.headers.get('access-control-allow-headers') || '', /Idempotency-Key/)
  assert.match(response.headers.get('access-control-allow-methods') || '', /POST/)
})

function restore(previous: { akaun?: string; kuta?: string; kunci?: string; studio?: string }) {
  assign('COPILOT_AKAUN_URL', previous.akaun)
  assign('COPILOT_KUTA_SECRET', previous.kuta)
  assign('COPILOT_GEMINI_API_KEY', previous.kunci)
  assign('GEMINI_API_KEY', previous.studio)
}

function assign(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
