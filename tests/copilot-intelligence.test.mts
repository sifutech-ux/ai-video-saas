import assert from 'node:assert/strict'
import test from 'node:test'
import { intelligencePrompt, parseIntelligence, fetchBusinessContext, type BusinessContext } from '../src/lib/copilot-intelligence.ts'
import { adviseCopilot } from '../src/lib/copilot-nasihat.ts'
import { askOpenAIOnce } from '../src/lib/copilot-openai.ts'
import { realtimeConfig, createRealtimeCall } from '../src/lib/copilot-realtime.ts'
import type { KuotaClient } from '../src/lib/copilot-kuta.ts'

const context: BusinessContext = { ok: true, hari: '2026-11-13', minggu_mula: '2026-11-09',
  ingatan: { versi: 2, ingatan: { produk: 'Latte RM8' } }, matlamat: 'Tambah pelanggan',
  pelan: { versi: 3, tugasan: [{ teks: 'Hubungi 5 pelanggan', siap: false }] },
  angka: { minggu: { hasil: '350.00', kos: '120.00', beza_rekod: '230.00' } } }
const profile = { nama: 'Kedai Kopi Ujian', jualan: 'Kopi kepada pekerja pejabat', peringkat: 'jual' as const }
const actions = [{ jenis: 'angka', teks: 'Jualan hari ini', tarikh: '2026-11-13', kategori: 'hasil', nilai: '350.00' }]
const reply = { jawapan: 'Sila semak cadangan.\nBelum disimpan.', langkah: [], format: 'tindakan', cadangan: actions }

test('flexible answer keeps paragraphs and accepts zero or five steps; invalid proposals fail closed', () => {
  assert.equal(parseIntelligence(JSON.stringify(reply)).jawapan, reply.jawapan)
  for (const cadangan of [[{ ...actions[0], nilai: '-5' }], [{ ...actions[0], kategori: 'transfer' }], [{ ...actions[0], jenis: 'hantar_whatsapp' }]]) {
    assert.throws(() => parseIntelligence(JSON.stringify({ ...reply, cadangan })))
  }
  assert.throws(() => parseIntelligence(JSON.stringify({ ...reply, langkah: Array(6).fill('Langkah') })))
})

test('authoritative account context enters prompt and settlement; body-supplied account data is ignored', async () => {
  process.env.COPILOT_AKAUN_HOST = 'akaun.beshareaisolution.com'
  let prompt = '', settlement: Parameters<KuotaClient['muktamad']>[0] | undefined
  const r = await adviseCopilot({ origin: 'https://beshareaisolution.com', authorization: 'Bearer fixture',
    rateKey: 'intelligence-1', akaunUrl: 'https://akaun.beshareaisolution.com', idempotencyKey: 'fixture-intelligent-0001',
    body: { giliran: [{ dari: 'klien', teks: 'Catat jualan hari ini RM350' }], akaunId: 'foreign', ingatan: { produk: 'MALICIOUS' } },
    copilotKeyPresent: () => true, introspect: async () => ({ ok: true, akaunId: 'a'.repeat(32), exp: 1900000000, penasihat: profile }),
    contextReader: async () => context,
    kuota: { rezab: async () => ({ ok: true, status: 'reserved', rezabId: 'b'.repeat(32) }),
      hantar: async id => ({ ok: true, status: 'sending', rezabId: id }),
      muktamad: async input => { settlement = input; return { ok: true, status: input.hasil } } },
    ask: async p => { prompt = p; return { text: JSON.stringify(reply), model: 'fixture', promptTokens: 1, outputTokens: 1 } },
  })
  assert.equal(r.status, 200)
  assert.ok(prompt.includes('Latte RM8')); assert.ok(prompt.includes('230.00')); assert.ok(!prompt.includes('MALICIOUS'))
  assert.deepEqual(settlement?.cadangan, actions)
  assert.deepEqual(settlement?.asas, { minggu_mula: '2026-11-09', pelan_versi: 3, ingatan_versi: 2 })
})

test('missing account context stops before spending quota or calling provider', async () => {
  process.env.COPILOT_AKAUN_HOST = 'akaun.beshareaisolution.com'
  const fail = async () => { throw new Error('must not execute') }
  const r = await adviseCopilot({ origin: 'https://beshareaisolution.com', authorization: 'Bearer fixture',
    rateKey: 'intelligence-2', akaunUrl: 'https://akaun.beshareaisolution.com', idempotencyKey: 'fixture-intelligent-0002',
    body: { giliran: [{ dari: 'klien', teks: 'Berapa jualan saya?' }] }, copilotKeyPresent: () => true,
    introspect: async () => ({ ok: true, akaunId: 'a'.repeat(32), exp: 1900000000, penasihat: profile }),
    contextReader: async () => { throw new Error('offline') },
    kuota: { rezab: fail, hantar: fail, muktamad: fail }, ask: fail })
  assert.equal(r.status, 503)
})

test('enhanced provider uses strict schema and no tools can write directly', async () => {
  const old = globalThis.fetch, key = process.env.COPILOT_OPENAI_API_KEY
  process.env.COPILOT_OPENAI_API_KEY = 'synthetic-fixture-not-a-key'
  globalThis.fetch = async (_, init) => {
    const body = JSON.parse(String(init?.body))
    assert.equal(body.text.format.schema.properties.langkah.maxItems, 5)
    assert.equal(body.text.format.schema.properties.cadangan.maxItems, 5)
    assert.equal(body.store, false)
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(reply) }] }] })
  }
  try { assert.deepEqual(parseIntelligence((await askOpenAIOnce('fixture', true)).text).cadangan, actions) }
  finally { globalThis.fetch = old; if (key === undefined) delete process.env.COPILOT_OPENAI_API_KEY; else process.env.COPILOT_OPENAI_API_KEY = key }
})

test('realtime uses server-selected model/context, multipart SDP and no exposed provider key', async () => {
  const config = realtimeConfig(profile, context)
  assert.equal(config.model, 'gpt-realtime-2.1')
  assert.ok(config.instructions.includes('Latte RM8'))
  assert.ok(config.instructions.includes('tidak boleh menyimpan'))
  const old = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/realtime/calls')
    const data = init?.body as FormData
    assert.equal(data.get('sdp'), 'v=0\r\nfixture')
    assert.equal(JSON.parse(String(data.get('session'))).audio.output.voice, 'cedar')
    return new Response('v=0\r\nanswer', { headers: { location: '/v1/realtime/calls/rtc_fixture' } })
  }
  try { assert.deepEqual(await createRealtimeCall('v=0\r\nfixture', profile, context), { sdp: 'v=0\r\nanswer', callId: 'rtc_fixture' }) }
  finally { globalThis.fetch = old }
})

test('context fetch targets approved server only and refuses redirects', async () => {
  process.env.COPILOT_AKAUN_HOST = 'akaun.beshareaisolution.com'
  const old = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://akaun.beshareaisolution.com/api/akaun/copilot/konteks')
    assert.equal(init?.redirect, 'error'); assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer fixture')
    return Response.json(context)
  }
  try {
    assert.deepEqual(await fetchBusinessContext('https://akaun.beshareaisolution.com', 'Bearer fixture'), context)
    await assert.rejects(() => fetchBusinessContext('https://evil.example', 'Bearer fixture'))
  } finally { globalThis.fetch = old }
})
