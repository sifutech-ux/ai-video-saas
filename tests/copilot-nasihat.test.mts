import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  adviseCopilot,
  copilotHeaders,
  copilotSessionUrl,
  fetchCopilotSession,
  parseCopilotSession,
} from '../src/lib/copilot-nasihat.ts'

const ASAL = 'https://beshareaisolution.com'
const AKAUN = 'https://akaun.example'
const TOKEN = 'Bearer token-ujian-bukan-rahsia'
const KONTEKS = {
  nama: 'Kedai Amanah',
  jualan: 'Kuih kering untuk pejabat kecil',
  peringkat: 'mula' as const,
}
const SOALAN = { giliran: [{ dari: 'klien', teks: 'Macam mana nak dapat pelanggan pertama?' }] }
const MODEL = '{"jawapan":"Tulis satu ayat tawaran.","langkah":["Senaraikan sepuluh orang.","Mesej tiga orang.","Tetapkan cara bayar."]}'

function sesiAmanah() {
  return { ok: true as const, akaunId: 'a'.repeat(32), exp: 1_900_000_000, penasihat: KONTEKS }
}

test('cors copilot membenarkan bearer dan menolak asal lain sebagai pengesahan', () => {
  const headers = copilotHeaders(ASAL)
  assert.equal(headers['Access-Control-Allow-Headers'], 'Content-Type, Authorization')
  assert.equal(headers['Access-Control-Allow-Origin'], ASAL)
  assert.equal(copilotHeaders('https://evil.example')['Access-Control-Allow-Origin'], ASAL)
  assert.equal(copilotSessionUrl(`${AKAUN}/lama?token=rahsia#frag`), `${AKAUN}/api/akaun/copilot/sesi`)
  assert.equal(copilotSessionUrl('file:///tmp/akaun'), null)
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

test('pengesahan gagal tidak memanggil gemini atau introspeksi', async () => {
  let intro = 0
  let model = 0
  const introspect = async () => {
    intro += 1
    return sesiAmanah()
  }
  const ask = async () => {
    model += 1
    return MODEL
  }
  const tiada = await adviseCopilot({
    origin: ASAL,
    authorization: null,
    body: { ...SOALAN, user_id: 'b'.repeat(32), nama: 'Syarikat Palsu' },
    rateKey: 'tiada-token',
    akaunUrl: AKAUN,
    now: 1_000,
    introspect,
    ask,
  })
  assert.equal(tiada.status, 401)
  assert.equal(intro, 0)
  assert.equal(model, 0)

  const asal = await adviseCopilot({
    origin: 'https://evil.example',
    authorization: TOKEN,
    body: SOALAN,
    rateKey: 'asal-jahat',
    akaunUrl: AKAUN,
    now: 1_000,
    introspect,
    ask,
  })
  assert.equal(asal.status, 403)
  assert.equal(intro, 0)
  assert.equal(model, 0)

  const url = await adviseCopilot({
    origin: ASAL,
    authorization: TOKEN,
    body: SOALAN,
    rateKey: 'url-kosong',
    akaunUrl: '',
    now: 1_000,
    introspect,
    ask,
  })
  assert.equal(url.status, 503)
  assert.equal(intro, 0)
  assert.equal(model, 0)
})

test('akaun tidak sah, dipadam, atau tidak dapat dihubungi gagal tertutup', async () => {
  const ask = async () => {
    throw new Error('gemini tidak patut dipanggil')
  }
  for (const status of [401, 503] as const) {
    const result = await adviseCopilot({
      origin: ASAL,
      authorization: TOKEN,
      body: SOALAN,
      rateKey: `sesi-${status}`,
      akaunUrl: AKAUN,
      now: 2_000,
      introspect: async () => ({ ok: false, status }),
      ask,
    })
    assert.equal(result.status, status)
    assert.equal(result.body.ok, undefined)
  }
  const lempar = await adviseCopilot({
    origin: ASAL,
    authorization: TOKEN,
    body: SOALAN,
    rateKey: 'sesi-lempar',
    akaunUrl: AKAUN,
    now: 3_000,
    introspect: async () => {
      throw new Error('sambungan putus')
    },
    ask,
  })
  assert.equal(lempar.status, 503)
})

test('konteks akaun dipercayai dan id klien diabaikan', async () => {
  const prompts: string[] = []
  const result = await adviseCopilot({
    origin: ASAL,
    authorization: TOKEN,
    body: {
      ...SOALAN,
      user_id: 'b'.repeat(32),
      nama: 'Syarikat Palsu',
      jualan: 'Modal rahsia RM500000',
      peringkat: 'kembang',
    },
    rateKey: 'asing',
    akaunUrl: AKAUN,
    now: 4_000,
    introspect: async (_url, authorization) => {
      assert.equal(authorization, TOKEN)
      return sesiAmanah()
    },
    ask: async (prompt) => {
      prompts.push(prompt)
      return MODEL
    },
  })
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

test('profil kosong tidak memanggil gemini', async () => {
  let model = 0
  const result = await adviseCopilot({
    origin: ASAL,
    authorization: TOKEN,
    body: SOALAN,
    rateKey: 'profil-kosong',
    akaunUrl: AKAUN,
    now: 5_000,
    introspect: async () => ({ ...sesiAmanah(), penasihat: null }),
    ask: async () => {
      model += 1
      return MODEL
    },
  })
  assert.equal(result.status, 422)
  assert.equal(model, 0)
})

test('kegagalan dan output model yang rosak bukan kejayaan', async () => {
  const gagal = await adviseCopilot({
    origin: ASAL,
    authorization: TOKEN,
    body: SOALAN,
    rateKey: 'model-gagal',
    akaunUrl: AKAUN,
    now: 6_000,
    introspect: async () => sesiAmanah(),
    ask: async () => {
      throw new Error('masa tamat')
    },
  })
  assert.equal(gagal.status, 502)
  assert.equal(gagal.body.ok, false)
  assert.equal(gagal.body.sumber, 'tempatan')
  assert.equal(gagal.body.bukan_model, true)
  assert.equal(gagal.body.ralat, 'model_gagal')
  assert.match(String(gagal.body.label), /bukan jawapan model/)
  assert.equal(JSON.stringify(gagal.body).includes('masa tamat'), false)

  const rosak = await adviseCopilot({
    origin: ASAL,
    authorization: TOKEN,
    body: SOALAN,
    rateKey: 'output-rosak',
    akaunUrl: AKAUN,
    now: 7_000,
    introspect: async () => sesiAmanah(),
    ask: async () => '{"jawapan":"Untung RM888881","langkah":["satu"]}',
  })
  assert.equal(rosak.status, 502)
  assert.equal(rosak.body.ok, false)
  assert.equal(rosak.body.ralat, 'output_tidak_sah')
  assert.equal(rosak.body.sumber, 'tempatan')
  assert.equal(JSON.stringify(rosak.body).includes('RM888881'), false)
  assert.equal(Array.isArray(rosak.body.langkah) && rosak.body.langkah.length === 3, true)
})

test('had kadar berlaku sebelum panggilan akaun', async () => {
  let intro = 0
  const input = {
    origin: ASAL,
    authorization: TOKEN,
    body: SOALAN,
    rateKey: 'kadar-copilot',
    akaunUrl: AKAUN,
    now: 8_000,
    introspect: async () => {
      intro += 1
      return { ok: false as const, status: 401 as const }
    },
    ask: async () => MODEL,
  }
  for (let i = 0; i < 12; i += 1) {
    const result = await adviseCopilot(input)
    assert.equal(result.status, 401)
  }
  const lebih = await adviseCopilot(input)
  assert.equal(lebih.status, 429)
  assert.equal(intro, 12)
})

test('fetch sesi tidak mengekori redirect dan tidak menghantar id klien', async () => {
  const calls: Array<{ url: string; authorization: string }> = []
  const result = await fetchCopilotSession(AKAUN, TOKEN, async (url, init) => {
    const headers = init?.headers as { Authorization: string }
    calls.push({ url: String(url), authorization: headers.Authorization })
    return new Response(JSON.stringify({ ok: false }), { status: 500 })
  })
  assert.equal(result.ok, false)
  assert.equal(result.status, 503)
  assert.equal(calls[0].url, `${AKAUN}/api/akaun/copilot/sesi`)
  assert.equal(calls[0].authorization, TOKEN)
  assert.equal(calls[0].url.includes('user_id'), false)

  const putus = await fetchCopilotSession(AKAUN, TOKEN, async () => {
    throw new Error('tidak dapat dihubungi')
  })
  assert.equal(putus.status, 503)

  const sumber = readFileSync(new URL('../src/lib/copilot-nasihat.ts', import.meta.url), 'utf8')
  const laluan = readFileSync(new URL('../src/app/api/copilot/nasihat/route.ts', import.meta.url), 'utf8')
  for (const fail of [sumber, laluan]) {
    assert.equal(fail.includes('AKAUN_SECRET'), false)
    assert.equal(fail.includes('TELEGRAM_BOT_TOKEN'), false)
    assert.equal(fail.includes('console.'), false)
  }
})
