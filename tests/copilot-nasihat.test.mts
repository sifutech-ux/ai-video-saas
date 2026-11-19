import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { after, before } from 'node:test'
import { ModelAttemptError } from '../src/lib/copilot-model.ts'
import {
  adviseCopilot,
  copilotHeaders,
  copilotSessionUrl,
  fetchCopilotSession,
  parseCopilotSession,
} from '../src/lib/copilot-nasihat.ts'
import type { KuotaClient } from '../src/lib/copilot-kuta.ts'

const ASAL = 'https://beshareaisolution.com'
const AKAUN = 'https://akaun.beshareaisolution.com'
let hosTerdahulu: string | undefined
before(() => {
  hosTerdahulu = process.env.COPILOT_AKAUN_HOST
  process.env.COPILOT_AKAUN_HOST = 'akaun.beshareaisolution.com'
})
after(() => {
  if (hosTerdahulu === undefined) delete process.env.COPILOT_AKAUN_HOST
  else process.env.COPILOT_AKAUN_HOST = hosTerdahulu
})
const TOKEN = 'Bearer token-ujian-bukan-rahsia'
const KONTEKS = {
  nama: 'Kedai Amanah',
  jualan: 'Kuih kering untuk pejabat kecil',
  peringkat: 'mula' as const,
}
const SOALAN = { giliran: [{ dari: 'klien', teks: 'Macam mana nak dapat pelanggan pertama?' }] }
const MODEL = '{"jawapan":"Tulis satu ayat tawaran.","langkah":["Senaraikan sepuluh orang.","Mesej tiga orang.","Tetapkan cara bayar."]}'
const KUNCI = 'idem-copilot-ujian-01'

function sesiAmanah() {
  return { ok: true as const, akaunId: 'a'.repeat(32), exp: 1_900_000_000, penasihat: KONTEKS }
}

function jawapanModel() {
  return { text: MODEL, model: 'gemini-3.5-flash-lite', promptTokens: null, outputTokens: null }
}

function kuotaLulus(calls?: { hantar: number; muktamad: Array<string | undefined> }) {
  const client: KuotaClient = {
    async rezab() {
      return { ok: true, status: 'reserved', rezabId: 'rezab-ujian-0001' }
    },
    async hantar() {
      if (calls) calls.hantar += 1
      return { ok: true, status: 'sending', rezabId: 'rezab-ujian-0001' }
    },
    async muktamad(input) {
      calls?.muktamad.push(input.hasil)
      return { ok: true, status: input.hasil }
    },
  }
  return client
}

function asas(over: Partial<Parameters<typeof adviseCopilot>[0]> = {}) {
  return {
    origin: ASAL,
    authorization: TOKEN,
    body: SOALAN,
    rateKey: 'ujian',
    akaunUrl: AKAUN,
    idempotencyKey: KUNCI,
    copilotKeyPresent: () => true,
    now: 1_000,
    introspect: async () => sesiAmanah(),
    kuota: kuotaLulus(),
    ask: async () => jawapanModel(),
    ...over,
  }
}

test('cors copilot membenarkan bearer dan menolak hos lain', () => {
  const headers = copilotHeaders(ASAL)
  assert.equal(headers['Access-Control-Allow-Headers'], 'Content-Type, Authorization, Idempotency-Key')
  assert.equal(headers['Access-Control-Allow-Origin'], ASAL)
  assert.equal(copilotHeaders('https://evil.example')['Access-Control-Allow-Origin'], ASAL)
  assert.equal(copilotSessionUrl(AKAUN), `${AKAUN}/api/akaun/copilot/sesi`)
  assert.equal(copilotSessionUrl(`${AKAUN}/lama?token=rahsia#frag`), null)
  assert.equal(copilotSessionUrl(`${AKAUN}?token=rahsia`), null)
  assert.equal(copilotSessionUrl('https://user:rahsia@beshare-ipo-bot.onrender.com'), null)
  assert.equal(copilotSessionUrl('http://beshare-ipo-bot.onrender.com'), null)
  assert.equal(copilotSessionUrl('https://beshare-ipo-bot.onrender.com:8443'), null)
  assert.equal(copilotSessionUrl('https://127.0.0.1'), null)
  assert.equal(copilotSessionUrl('https://10.0.0.5'), null)
  assert.equal(copilotSessionUrl('http://127.0.0.1:8767'), null)
  assert.equal(copilotSessionUrl('file:///tmp/akaun'), null)
  const nodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'
  assert.equal(copilotSessionUrl('http://127.0.0.1:8767', { testLoopback: true }), 'http://127.0.0.1:8767/api/akaun/copilot/sesi')
  process.env.NODE_ENV = 'production'
  try {
    assert.equal(copilotSessionUrl('http://127.0.0.1:8767', { testLoopback: true }), null)
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = nodeEnv
  }
})

test('sesi copilot gagal tertutup bila bentuk atau exp tidak sah', () => {
  const now = 1_700_000_000_000
  const sah = {
    ok: true,
    akaun_id: 'ab12cd34ef56ab78ab12cd34ef56ab78',
    exp: 1_700_000_120,
    penasihat: KONTEKS,
    password_hash: 'jangan-dedah',
  }
  const body = parseCopilotSession(sah, now)
  assert.equal(body.ok, true)
  assert.equal(JSON.stringify(body).includes('jangan-dedah'), false)
  assert.equal(parseCopilotSession({ ...sah, exp: 1_699_000_000 }, now).status, 401)
  assert.equal(parseCopilotSession({ ok: true, akaun_id: sah.akaun_id, exp: sah.exp }, now).status, 503)
  assert.equal(parseCopilotSession({ ...sah, penasihat: { nama: 'X', jualan: 'pendek', peringkat: 'mula' } }, now).status, 503)
})

test('pengesahan gagal tidak memanggil gemini atau kuota', async () => {
  let intro = 0
  let model = 0
  let kuota = 0
  const introspect = async () => {
    intro += 1
    return sesiAmanah()
  }
  const ask = async () => {
    model += 1
    return jawapanModel()
  }
  const klien: KuotaClient = {
    async rezab() {
      kuota += 1
      throw new Error('kuota tidak patut')
    },
    async hantar() {
      kuota += 1
      throw new Error('kuota tidak patut')
    },
    async muktamad() {
      kuota += 1
      throw new Error('kuota tidak patut')
    },
  }
  const tiada = await adviseCopilot(asas({
    authorization: null,
    body: { ...SOALAN, user_id: 'b'.repeat(32), nama: 'Syarikat Palsu' },
    rateKey: 'tiada-token',
    introspect,
    ask,
    kuota: klien,
  }))
  assert.equal(tiada.status, 401)
  const asal = await adviseCopilot(asas({
    origin: 'https://evil.example',
    rateKey: 'asal-jahat',
    introspect,
    ask,
    kuota: klien,
  }))
  assert.equal(asal.status, 403)
  const url = await adviseCopilot(asas({
    rateKey: 'url-kosong',
    akaunUrl: '',
    introspect,
    ask,
    kuota: klien,
  }))
  assert.equal(url.status, 503)
  const hos = await adviseCopilot(asas({
    rateKey: 'hos-lain',
    akaunUrl: 'https://akaun.example',
    introspect,
    ask,
    kuota: klien,
  }))
  assert.equal(hos.status, 503)
  assert.equal(intro, 0)
  assert.equal(model, 0)
  assert.equal(kuota, 0)
})

test('akaun tidak sah, dipadam, atau tidak dapat dihubungi gagal tertutup', async () => {
  const ask = async () => {
    throw new Error('gemini tidak patut dipanggil')
  }
  for (const status of [401, 503] as const) {
    const result = await adviseCopilot(asas({
      rateKey: `sesi-${status}`,
      now: 2_000 + status,
      introspect: async () => ({ ok: false, status }),
      ask,
    }))
    assert.equal(result.status, status)
    assert.equal(result.body.ok, undefined)
  }
  const lempar = await adviseCopilot(asas({
    rateKey: 'sesi-lempar',
    now: 3_000,
    introspect: async () => {
      throw new Error('sambungan putus')
    },
    ask,
  }))
  assert.equal(lempar.status, 503)
})

test('konteks akaun dipercayai dan id klien diabaikan', async () => {
  const prompts: string[] = []
  const result = await adviseCopilot(asas({
    rateKey: 'asing',
    now: 4_000,
    body: {
      ...SOALAN,
      user_id: 'b'.repeat(32),
      nama: 'Syarikat Palsu',
      jualan: 'Modal rahsia RM500000',
      peringkat: 'kembang',
    },
    introspect: async (_url, authorization) => {
      assert.equal(authorization, TOKEN)
      return sesiAmanah()
    },
    ask: async (prompt) => {
      prompts.push(prompt)
      return jawapanModel()
    },
  }))
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  assert.equal(result.body.sumber, 'gemini')
  assert.equal(result.body.bukan_model, false)
  assert.equal(prompts.length, 1)
  assert.match(prompts[0], /Kedai Amanah/)
  assert.equal(prompts[0].includes('Syarikat Palsu'), false)
  assert.equal(prompts[0].includes('RM500000'), false)
  assert.equal(prompts[0].includes('b'.repeat(32)), false)
  assert.equal(JSON.stringify(result.body).includes('a'.repeat(32)), false)
})

test('profil kosong, kunci tiada, dan kuota penuh tidak memanggil gemini', async () => {
  let model = 0
  const ask = async () => {
    model += 1
    return jawapanModel()
  }
  const kosong = await adviseCopilot(asas({
    rateKey: 'profil-kosong',
    now: 5_000,
    introspect: async () => ({ ...sesiAmanah(), penasihat: null }),
    ask,
  }))
  assert.equal(kosong.status, 422)
  assert.equal(kosong.body.ralat, 'profil')
  const kunci = await adviseCopilot(asas({
    rateKey: 'kunci-tiada',
    now: 5_100,
    copilotKeyPresent: () => false,
    ask,
  }))
  assert.equal(kunci.status, 503)
  const penuh = await adviseCopilot(asas({
    rateKey: 'kuota-penuh',
    now: 5_200,
    kuota: {
      async rezab() {
        return { ok: false, status: 429, ralat: 'had' }
      },
      async hantar() {
        throw new Error('hantar tidak patut')
      },
      async muktamad() {
        throw new Error('muktamad tidak patut')
      },
    },
    ask,
  }))
  assert.equal(penuh.status, 429)
  assert.equal(penuh.body.ok, undefined)
  const proses = await adviseCopilot(asas({
    rateKey: 'kuota-proses',
    now: 5_300,
    kuota: {
      async rezab() {
        return { ok: false, status: 409, ralat: 'menunggu' }
      },
      async hantar() {
        throw new Error('hantar tidak patut')
      },
      async muktamad() {
        throw new Error('muktamad tidak patut')
      },
    },
    ask,
  }))
  assert.equal(proses.status, 409)
  assert.equal(proses.body.ralat, 'menunggu')
  assert.equal(proses.body.retryable, undefined)
  assert.equal(model, 0)
})

test('status rezab sampai kepada klien tanpa panggilan model atau perubahan keadaan', async () => {
  for (const failure of [
    { ok: false, status: 409, ralat: 'menunggu' },
    { ok: false, status: 409, ralat: 'kunci_berbeza' },
    { ok: false, status: 503, ralat: 'tidak_pasti' },
    { ok: false, status: 503, ralat: 'provider_failed', retryable: true },
    { ok: false, status: 503, ralat: 'provider_failed' },
  ] as const) {
    const unexpected = async () => { throw new Error('No send, finalization or model call expected') }
    const result = await adviseCopilot(asas({
      rateKey: `contract-${failure.ralat}-${failure.retryable || false}`,
      kuota: { rezab: async () => failure, hantar: unexpected, muktamad: unexpected },
      ask: unexpected,
    }))
    assert.equal(result.status, failure.status)
    assert.equal(result.body.ralat, failure.ralat)
    assert.equal(result.body.retryable, failure.retryable)
    assert.equal(result.body.jawapan, undefined)
  }
  const pending = await adviseCopilot(asas({
    rateKey: 'contract-hantar',
    kuota: { ...kuotaLulus(), hantar: async () => ({ ok: false, status: 409, ralat: 'menunggu' }) },
    ask: async () => { throw new Error('No provider call after failed hantar') },
  }))
  assert.equal(pending.status, 409)
  assert.equal(pending.body.ralat, 'menunggu')
  assert.equal(pending.body.retryable, undefined)
})

test('balasan disimpan diulang tanpa model dan simpanan gagal tidak dedah jawapan', async () => {
  let model = 0
  const ulang = await adviseCopilot(asas({
    rateKey: 'main-semula',
    now: 5_400,
    kuota: {
      async rezab() {
        return {
          ok: true,
          status: 'settled',
          rezabId: 'rezab-ujian-0001',
          mainSemula: true,
          reply: {
            jawapan: 'Jawapan disimpan.',
            langkah: ['Satu', 'Dua', 'Tiga'],
          },
        }
      },
      async hantar() {
        throw new Error('hantar tidak patut')
      },
      async muktamad() {
        throw new Error('muktamad tidak patut')
      },
    },
    ask: async () => {
      model += 1
      return jawapanModel()
    },
  }))
  assert.equal(ulang.status, 200)
  assert.equal(ulang.body.main_semula, true)
  assert.equal(ulang.body.jawapan, 'Jawapan disimpan.')
  assert.equal(model, 0)

  const calls = { hantar: 0, muktamad: [] as Array<string | undefined> }
  const simpan = await adviseCopilot(asas({
    rateKey: 'simpan-gagal',
    now: 5_500,
    kuota: {
      ...kuotaLulus(calls),
      async muktamad(input) {
        calls.muktamad.push(input.hasil)
        return { ok: false, status: 503, ralat: 'kuota_tidak_sedia' }
      },
    },
    ask: async () => {
      model += 1
      return jawapanModel()
    },
  }))
  assert.equal(simpan.status, 503)
  assert.equal(JSON.stringify(simpan.body).includes('Tulis satu ayat'), false)
  assert.equal(simpan.body.ok, undefined)
  assert.equal(simpan.body.ralat, 'tidak_pasti')
  assert.equal(simpan.body.retryable, undefined)
  assert.equal(model, 1)
  assert.equal(calls.muktamad.length, 3)
  assert.equal(calls.hantar, 1)
})

test('kegagalan dan output model yang rosak bukan kejayaan', async () => {
  const gagalCalls = { hantar: 0, muktamad: [] as Array<string | undefined> }
  const gagal = await adviseCopilot(asas({
    rateKey: 'model-gagal',
    now: 6_000,
    kuota: kuotaLulus(gagalCalls),
    ask: async () => {
      throw new ModelAttemptError('uncertain')
    },
  }))
  assert.equal(gagal.status, 502)
  assert.equal(gagal.body.ok, false)
  assert.equal(gagal.body.sumber, 'tempatan')
  assert.equal(gagal.body.bukan_model, true)
  assert.equal(gagal.body.ralat, 'tidak_pasti')
  assert.equal(gagal.body.sebab, 'model_gagal')
  assert.equal(gagal.body.retryable, undefined)
  assert.match(String(gagal.body.label), /bukan jawapan model/)
  assert.equal(JSON.stringify(gagal.body).includes('uncertain'), false)
  assert.deepEqual(gagalCalls.muktamad, ['uncertain'])

  const rosakCalls = { hantar: 0, muktamad: [] as Array<string | undefined> }
  const previousWarn = console.warn, events: unknown[] = []
  console.warn = (event: unknown) => { events.push(event) }
  let rosak: Awaited<ReturnType<typeof adviseCopilot>>
  try {
    rosak = await adviseCopilot(asas({
      rateKey: 'output-rosak',
      now: 7_000,
      kuota: kuotaLulus(rosakCalls),
      ask: async () => ({ text: '{"jawapan":"Untung RM888881","langkah":["satu"]}', model: 'm', promptTokens: null, outputTokens: null }),
    }))
  } finally { console.warn = previousWarn }
  assert.deepEqual(events, ['{"event":"copilot_reply_invalid"}'])
  assert.equal(rosak.status, 502)
  assert.equal(rosak.body.ok, false)
  assert.equal(rosak.body.ralat, 'provider_failed')
  assert.equal(rosak.body.sebab, 'output_tidak_sah')
  assert.equal(rosak.body.retryable, true)
  assert.equal(rosak.body.sumber, 'tempatan')
  assert.equal(JSON.stringify(rosak.body).includes('RM888881'), false)
  assert.equal(Array.isArray(rosak.body.langkah) && rosak.body.langkah.length === 3, true)
  assert.deepEqual(rosakCalls.muktamad, ['provider_failed'])
})

test('model gagal boleh dijana semula hanya selepas pengakuan muktamad yang tepat', async () => {
  for (const mode of ['confirmed', 'unavailable', 'mismatched', 'throws'] as const) {
    let model = 0
    const finalized: string[] = []
    const result = await adviseCopilot(asas({
      rateKey: `failure-finalization-${mode}`,
      kuota: {
        ...kuotaLulus(),
        async muktamad(input) {
          finalized.push(input.hasil)
          if (mode === 'throws') throw new Error('PRIVATE-DATABASE-DETAIL')
          if (mode === 'unavailable') return { ok: false, status: 503, ralat: 'kuota_tidak_sedia' }
          return { ok: true, status: mode === 'confirmed' ? 'provider_failed' : 'uncertain' }
        },
      },
      ask: async () => { model += 1; throw new ModelAttemptError('provider_failed') },
    }))
    assert.equal(model, 1)
    assert.deepEqual(finalized, Array(mode === 'unavailable' || mode === 'throws' ? 3 : 1).fill('provider_failed'))
    assert.equal(JSON.stringify(result).includes('PRIVATE-DATABASE-DETAIL'), false)
    if (mode === 'confirmed') {
      assert.equal(result.status, 502)
      assert.equal(result.body.ralat, 'provider_failed')
      assert.equal(result.body.retryable, true)
      assert.equal(result.body.ok, false)
      assert.equal(result.body.sumber, 'tempatan')
      assert.equal(result.body.bukan_model, true)
    } else {
      assert.equal(result.status, 503)
      assert.equal(result.body.ralat, 'tidak_pasti')
      assert.equal(result.body.retryable, undefined)
      assert.equal(result.body.jawapan, undefined)
    }
  }
})

test('simpanan yang melempar tidak mengelaskan semula model berjaya sebagai provider_failed', async () => {
  let model = 0
  const finalized: string[] = []
  const result = await adviseCopilot(asas({
    rateKey: 'successful-model-finalization-throws',
    kuota: {
      ...kuotaLulus(),
      async muktamad(input) { finalized.push(input.hasil); throw new Error('PRIVATE-STORAGE-DETAIL') },
    },
    ask: async () => { model += 1; return jawapanModel() },
  }))
  assert.equal(model, 1)
  assert.deepEqual(finalized, ['settled', 'settled', 'settled'])
  assert.equal(result.status, 503)
  assert.equal(result.body.ralat, 'tidak_pasti')
  assert.equal(result.body.retryable, undefined)
  assert.equal(result.body.jawapan, undefined)
  assert.equal(JSON.stringify(result).includes('PRIVATE-STORAGE-DETAIL'), false)
})

test('had kadar berlaku sebelum panggilan akaun', async () => {
  let intro = 0
  const input = asas({
    rateKey: 'kadar-copilot',
    now: 8_000,
    introspect: async () => {
      intro += 1
      return { ok: false as const, status: 401 as const }
    },
    ask: async () => jawapanModel(),
  })
  for (let i = 0; i < 12; i += 1) {
    const result = await adviseCopilot(input)
    assert.equal(result.status, 401)
  }
  const lebih = await adviseCopilot(input)
  assert.equal(lebih.status, 429)
  assert.equal(intro, 12)
})

test('fetch sesi tidak mengekori redirect dan tidak menghantar id klien', async () => {
  const calls: Array<{ url: string; authorization: string; redirect: RequestRedirect | undefined }> = []
  const result = await fetchCopilotSession(AKAUN, TOKEN, async (url, init) => {
    const headers = init?.headers as { Authorization: string }
    calls.push({ url: String(url), authorization: headers.Authorization, redirect: init?.redirect })
    return new Response(JSON.stringify({ ok: false }), { status: 500 })
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 503)
  assert.equal(calls[0].url, `${AKAUN}/api/akaun/copilot/sesi`)
  assert.equal(calls[0].authorization, TOKEN)
  assert.equal(calls[0].redirect, 'error')
  assert.equal(calls[0].url.includes('user_id'), false)

  const putus = await fetchCopilotSession(AKAUN, TOKEN, async () => {
    throw new Error('tidak dapat dihubungi')
  })
  assert.equal(putus.status, 503)

  const sumber = readFileSync(new URL('../src/lib/copilot-nasihat.ts', import.meta.url), 'utf8')
  const laluan = readFileSync(new URL('../src/app/api/copilot/nasihat/route.ts', import.meta.url), 'utf8')
  const model = readFileSync(new URL('../src/lib/copilot-model.ts', import.meta.url), 'utf8')
  for (const fail of [sumber, laluan, model]) {
    assert.equal(fail.includes('AKAUN_SECRET'), false)
    assert.equal(fail.includes('TELEGRAM_BOT_TOKEN'), false)
  }
  assert.equal(laluan.includes('console.'), false)
  assert.equal(model.includes('console.'), false)
  assert.equal(laluan.includes('askGemini'), false)
  assert.equal(laluan.includes('process.env.GEMINI_API_KEY'), false)
  assert.equal(laluan.includes('copilotKeyPresent'), true)
  assert.equal(laluan.includes('testLoopback'), false)
  assert.equal(model.includes('COPILOT_GEMINI_API_KEY'), true)
})
