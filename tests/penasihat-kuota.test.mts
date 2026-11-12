import assert from 'node:assert/strict'
import test from 'node:test'
import { POST } from '../src/app/api/penasihat/route.ts'
import { advisePublicQuota } from '../src/lib/penasihat-kuota.ts'
import { publicRuntime } from '../src/lib/copilot-model.ts'
import type { KuotaClient } from '../src/lib/copilot-kuta.ts'

const SOALAN = {
  nama: 'Kedai Awam',
  jualan: 'Kuih kering untuk pejabat kecil',
  peringkat: 'mula' as const,
  giliran: [{ dari: 'klien' as const, teks: 'Macam mana nak mula?' }],
}
const MODEL = '{"jawapan":"Jawapan model ujian.","langkah":["Satu langkah.","Dua langkah.","Tiga langkah."]}'

function kuota(status: number, ralat: string): KuotaClient {
  return {
    async rezab() {
      return { ok: false, status, ralat }
    },
    async hantar() {
      throw new Error('hantar tidak patut')
    },
    async muktamad() {
      throw new Error('muktamad tidak patut')
    },
  }
}

function permintaan(ip: string) {
  return new Request('https://beshareaisolution.com/api/penasihat', {
    method: 'POST',
    headers: {
      origin: 'https://beshareaisolution.com',
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(SOALAN),
  })
}

test('kuota awam gagal sebelum model dan sandaran kekal bila model gagal', async () => {
  let model = 0
  const ask = async () => {
    model += 1
    return { text: MODEL, model: 'gemini-3.5-flash-lite', promptTokens: null, outputTokens: null }
  }
  const had = await advisePublicQuota({ soalan: SOALAN, kuota: kuota(429, 'had'), ask })
  assert.equal(had.status, 429)
  assert.equal(had.body.ok, undefined)
  const putus = await advisePublicQuota({ soalan: SOALAN, kuota: kuota(503, 'kuota_tidak_sedia'), ask })
  assert.equal(putus.status, 503)
  assert.equal(model, 0)

  const calls: string[] = []
  const lulus: KuotaClient = {
    async rezab() {
      return { ok: true, status: 'reserved', rezabId: 'rezab-awam-0001' }
    },
    async hantar() {
      return { ok: true, status: 'sending', rezabId: 'rezab-awam-0001' }
    },
    async muktamad(input) {
      calls.push(input.hasil)
      return { ok: true, status: input.hasil }
    },
  }
  const gagal = await advisePublicQuota({
    soalan: SOALAN,
    kuota: lulus,
    ask: async () => {
      model += 1
      throw Object.assign(new Error('masa'), { kind: 'uncertain' })
    },
  })
  assert.equal(gagal.status, 200)
  assert.equal(gagal.body.ok, true)
  assert.equal(typeof gagal.body.jawapan, 'string')
  assert.equal(Array.isArray(gagal.body.langkah) && (gagal.body.langkah as unknown[]).length, 3)
  assert.equal(JSON.stringify(gagal.body).includes('Jawapan model'), false)
  assert.deepEqual(calls, ['uncertain'])
  assert.equal(model, 1)
})

test('bendera kuota mati mengekalkan sandaran tanpa panggilan kuota', async () => {
  const previousFetch = globalThis.fetch
  const previous = save()
  delete process.env.PENASIHAT_KUOTA
  delete process.env.GEMINI_API_KEY
  let fetchCalls = 0
  let model = 0
  const original = publicRuntime.generate
  publicRuntime.generate = async () => {
    model += 1
    throw new Error('model tidak patut')
  }
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('kuota tidak patut')
  }
  try {
    const response = await POST(permintaan('203.0.113.50'))
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(typeof body.jawapan, 'string')
    assert.equal(body.langkah.length, 3)
    assert.equal(body.sumber, undefined)
    assert.equal(fetchCalls, 0)
    assert.equal(model, 0)

    process.env.PENASIHAT_KUOTA = 'true'
    const bukan = await POST(permintaan('203.0.113.51'))
    assert.equal(bukan.status, 200)
    assert.equal((await bukan.json()).ok, true)
    assert.equal(fetchCalls, 0)
  } finally {
    globalThis.fetch = previousFetch
    publicRuntime.generate = original
    restore(previous)
  }
})

test('bendera kuota hidup menempah sebelum model dan memulangkan 429', async () => {
  const previousFetch = globalThis.fetch
  const previous = save()
  process.env.PENASIHAT_KUOTA = 'on'
  process.env.GEMINI_API_KEY = 'ujian-bukan-panggilan'
  process.env.COPILOT_AKAUN_URL = 'https://akaun.beshareaisolution.com'
  process.env.COPILOT_AKAUN_HOST = 'akaun.beshareaisolution.com'
  process.env.COPILOT_KUTA_SECRET = 'kuta-ujian'
  delete process.env.COPILOT_GEMINI_API_KEY
  let model = 0
  const original = publicRuntime.generate
  publicRuntime.generate = async (prompt) => {
    model += 1
    assert.equal(prompt.includes('Kedai Awam'), true)
    return { text: MODEL, model: 'gemini-3.5-flash-lite', promptTokens: 1, outputTokens: 2 }
  }
  globalThis.fetch = async (url, init) => {
    const href = String(url)
    const headers = init?.headers as Record<string, string>
    assert.equal(headers.Authorization, undefined)
    assert.equal(init?.redirect, 'error')
    if (href.endsWith('/rezab')) {
      const data = JSON.parse(Buffer.from(init?.body as Uint8Array).toString()) as { route?: string; nama?: string }
      assert.equal(data.route, 'penasihat_awam')
      assert.equal(data.nama, 'Kedai Awam')
      return Response.json({ ok: false, ralat: 'had' }, { status: 429 })
    }
    throw new Error('hantar tidak patut')
  }
  try {
    const ditolak = await POST(permintaan('203.0.113.60'))
    const badanDitolak = await ditolak.json()
    assert.equal(ditolak.status, 429)
    assert.equal(badanDitolak.ok, undefined)
    assert.equal(model, 0)

    globalThis.fetch = async (url, init) => {
      const path = new URL(String(url)).pathname
      if (path.endsWith('/rezab')) return Response.json({ ok: true, rezab_id: 'rezab-awam-0001', status: 'reserved' })
      if (path.endsWith('/hantar')) return Response.json({ ok: true, status: 'sending' })
      if (path.endsWith('/muktamad')) {
        const data = JSON.parse(Buffer.from(init?.body as Uint8Array).toString()) as { hasil?: string }
        assert.equal(data.hasil, 'settled')
        return Response.json({ ok: true, status: 'settled' })
      }
      throw new Error('laluan tidak dikenali')
    }
    const lulus = await POST(permintaan('203.0.113.61'))
    const badanLulus = await lulus.json()
    assert.equal(lulus.status, 200)
    assert.equal(badanLulus.ok, true)
    assert.equal(badanLulus.jawapan, 'Jawapan model ujian.')
    assert.equal(badanLulus.sumber, undefined)
    assert.equal(model, 1)

    delete process.env.GEMINI_API_KEY
    let fetchCalls = 0
    globalThis.fetch = async () => {
      fetchCalls += 1
      throw new Error('kuota tidak patut')
    }
    const tanpa = await POST(permintaan('203.0.113.62'))
    const badanTanpa = await tanpa.json()
    assert.equal(tanpa.status, 200)
    assert.equal(badanTanpa.ok, true)
    assert.equal(fetchCalls, 0)
    assert.equal(model, 1)
  } finally {
    globalThis.fetch = previousFetch
    publicRuntime.generate = original
    restore(previous)
  }
})

function save() {
  return {
    flag: process.env.PENASIHAT_KUOTA,
    gemini: process.env.GEMINI_API_KEY,
    copilot: process.env.COPILOT_GEMINI_API_KEY,
    akaun: process.env.COPILOT_AKAUN_URL,
    hos: process.env.COPILOT_AKAUN_HOST,
    kuta: process.env.COPILOT_KUTA_SECRET,
  }
}

function restore(previous: ReturnType<typeof save>) {
  assign('PENASIHAT_KUOTA', previous.flag)
  assign('GEMINI_API_KEY', previous.gemini)
  assign('COPILOT_GEMINI_API_KEY', previous.copilot)
  assign('COPILOT_AKAUN_URL', previous.akaun)
  assign('COPILOT_AKAUN_HOST', previous.hos)
  assign('COPILOT_KUTA_SECRET', previous.kuta)
}

function assign(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
