/** Opt-in live-provider acceptance. Synthetic accounts only; never print credentials. */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { setTimeout as pause } from 'node:timers/promises'
import { POST as advice } from '../src/app/api/copilot/bijak/route.ts'
import { POST as voice } from '../src/app/api/copilot/suara/route.ts'
import { speakOpenAI } from '../src/lib/copilot-openai.ts'

assert.equal(process.env.COPILOT_LIVE_QA, 'synthetic-only')
assert.equal(process.env.COPILOT_AKAUN_URL, 'https://copilot-qa.beshareaisolution.com')
const base = process.env.COPILOT_AKAUN_URL!
const origin = 'http://localhost:8000'
const realFetch = globalThis.fetch
let providerRequests = 0
globalThis.fetch = async (input, init) => {
  const result = await realFetch(input, init)
  if (String(input).startsWith('https://api.openai.com/v1/')) {
    providerRequests++
    let code: string | null = null
    if (!result.ok) {
      const error = await result.clone().json().catch(() => ({}))
      if (typeof error?.error?.code === 'string' && /^[a-z0-9_]+$/i.test(error.error.code)) code = error.error.code
    }
    console.log('COPILOT_PROVIDER', JSON.stringify({ path: new URL(String(input)).pathname, status: result.status, code }))
  }
  return result
}
const checks: { name: string; detail?: unknown }[] = []
function pass(name: string, detail?: unknown) { checks.push({ name, detail }); console.log('COPILOT_LIVE_PASS', JSON.stringify({ name, detail })) }
async function account(path: string, method = 'GET', data?: unknown, token = '', expected = 200): Promise<any> {
  const r = await fetch(base + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(10000) })
  const body = await r.json()
  assert.equal(r.status, expected, JSON.stringify({ path, status: r.status, error: body.error }))
  return body
}
async function makeAccount(email: string) {
  const login = await account('/api/akaun/daftar', 'POST', { email, password: randomBytes(24).toString('hex') })
  await account('/api/akaun/penasihat', 'POST', { penasihat: { nama: 'Kedai Kopi Ujian Sintetik', jualan: 'Kopi untuk pekerja pejabat di Ampang', peringkat: 'jual',
    mesej: [{ dari: 'klien', teks: 'Ini akaun ujian sintetik.' }] } }, login.token)
  return login.token as string
}
function request(path: string, body: unknown, token = '', id = randomBytes(16).toString('hex')) {
  return new Request('https://advice.example.test' + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Idempotency-Key': id }, body: JSON.stringify(body) })
}
async function ask(token: string, question: string, id = randomBytes(16).toString('hex')) {
  const r = await advice(request('/api/copilot/bijak', { giliran: [{ dari: 'klien', teks: question }] }, token, id))
  const body = await r.json()
  assert.equal(r.status, 200, JSON.stringify(body))
  assert.equal(body.bukan_model, false)
  assert.ok(['openai', 'tersimpan'].includes(body.sumber))
  return body
}
let tokenA = '', session = ''
try {
  assert.equal((await advice(request('/api/copilot/bijak', {}))).status, 401)
  assert.equal((await voice(request('/api/copilot/suara', { sdp: 'v=0' }))).status, 401)
  pass('Unauthenticated advice and voice rejected')
  tokenA = await makeAccount('live-a@example.test')
  const tokenB = await makeAccount('live-b@example.test')
  await account('/api/akaun/copilot/ingatan', 'PUT', { versi: 0, ingatan: { produk: 'Latte RM8.00', lokasi: 'Ampang', matlamat: '20 pelanggan berulang' } }, tokenA)
  assert.deepEqual((await account('/api/akaun/copilot/ingatan', 'GET', undefined, tokenB)).ingatan, {})
  const price = await ask(tokenA, 'Berapakah harga latte yang saya simpan? Jawab satu ayat sahaja.')
  assert.match(price.jawapan, /8(?:[.,]00)?/)
  assert.equal(price.cadangan.length, 0)
  pass('Saved memory used by real model; other account isolated', price.jawapan)
  await account('/api/akaun/copilot/ingatan', 'PUT', { versi: 1, ingatan: { produk: 'Latte RM9.50', lokasi: 'Ampang', matlamat: '20 pelanggan berulang' } }, tokenA)
  const changed = await ask(tokenA, 'Berapakah harga latte terkini dalam ingatan saya? Jawab satu ayat sahaja.')
  assert.match(changed.jawapan, /9[.,]50/)
  pass('Updated memory used by next real response', changed.jawapan)
  const question = 'Catat jualan hari ini RM350 dan kos hari ini RM120.'
  const idem = randomBytes(16).toString('hex')
  const proposal = await ask(tokenA, question, idem)
  assert.equal(proposal.cadangan.length, 2)
  assert.deepEqual(proposal.cadangan.map((x: any) => [x.kategori, Number(x.nilai)]).sort(), [['hasil', 350], ['kos', 120]])
  assert.equal((await account('/api/akaun/copilot/konteks', 'GET', undefined, tokenA)).angka.bilangan_rekod, 0)
  await account('/api/akaun/copilot/tindakan', 'POST', { cadangan_id: proposal.cadangan_id }, tokenA, 400)
  await account('/api/akaun/copilot/tindakan', 'POST', { cadangan_id: proposal.cadangan_id, sahkan: true }, tokenB, 404)
  await account('/api/akaun/copilot/tindakan', 'POST', { cadangan_id: proposal.cadangan_id, sahkan: true }, tokenA)
  const again = await account('/api/akaun/copilot/tindakan', 'POST', { cadangan_id: proposal.cadangan_id, sahkan: true }, tokenA)
  assert.equal(again.main_semula, true)
  const countBefore = providerRequests
  assert.equal((await ask(tokenA, question, idem)).main_semula, true)
  assert.equal(providerRequests, countBefore)
  const context = await account('/api/akaun/copilot/konteks', 'GET', undefined, tokenA)
  assert.equal(context.angka.bilangan_rekod, 2)
  assert.equal(context.angka.minggu.beza_rekod, '230.00')
  pass('Real proposals require owner confirmation; duplicate save and model replay prevented', { proposal: proposal.jawapan, totals: context.angka.minggu })
  const analysis = await ask(tokenA, 'Ringkaskan hasil, kos dan beza rekod minggu ini berdasarkan data saya. Jangan panggilnya untung bersih.')
  assert.match(analysis.jawapan, /350/); assert.match(analysis.jawapan, /120/); assert.match(analysis.jawapan, /230/)
  pass('Real analysis uses exact server totals', analysis.jawapan)
  const marketing = await ask(tokenA, 'Tulis draf iklan latte saya untuk WhatsApp dalam tiga perenggan pendek. Gunakan harga tersimpan, jangan tambah diskaun. Jangan simpan tugasan.')
  assert.equal(marketing.format, 'pemasaran'); assert.match(marketing.jawapan, /9[.,]50/); assert.match(marketing.jawapan, /\n/)
  assert.equal(marketing.cadangan.length, 0)
  await account('/api/akaun/penasihat', 'POST', { penasihat: { nama: 'Kedai Kopi Ujian Sintetik', jualan: 'Kopi untuk pekerja pejabat di Ampang', peringkat: 'jual',
    mesej: [{ dari: 'penasihat', teks: marketing.jawapan, format: marketing.format, langkah: marketing.langkah, cadangan_id: marketing.cadangan_id }] } }, tokenA)
  assert.equal((await account('/api/akaun/saya', 'GET', undefined, tokenA)).penasihat.mesej[0].teks, marketing.jawapan)
  pass('Marketing format and paragraphs persist in account', marketing.jawapan)
  const plan = await ask(tokenA, 'Tambah satu tugasan dalam pelan minggu ini: hubungi lima pelanggan lama.')
  assert.equal(plan.cadangan.length, 1); assert.equal(plan.cadangan[0].jenis, 'tugas')
  await account('/api/akaun/copilot/tindakan', 'POST', { cadangan_id: plan.cadangan_id, sahkan: true }, tokenA)
  assert.equal((await account('/api/akaun/copilot/konteks', 'GET', undefined, tokenA)).pelan.tugasan.length, 1)
  pass('Real task proposal saved to current-week plan', plan.jawapan)
  const empty = await ask(tokenB, 'Berapakah hasil dan kos perniagaan saya minggu ini?')
  assert.equal((await account('/api/akaun/copilot/konteks', 'GET', undefined, tokenB)).angka.minggu.hasil, null)
  assert.equal(empty.cadangan.length, 0)
  pass('Empty account response reviewed against absent records', empty.jawapan)
  console.log('COPILOT_LIVE_TEXT_RESULT', JSON.stringify({ checks, providerRequests }))
  const audio = await speakOpenAI('Berapakah harga latte saya sekarang?')
  console.log('COPILOT_AUDIO_FIXTURE', JSON.stringify(audio))
  console.log('COPILOT_VOICE_WAITING_FOR_OFFER_AND_MEDIA_READY')
  const deadline = Date.now() + 180000
  while ((!existsSync('/qa/shared/offer.json') || !existsSync('/qa/shared/media-ready.json')) && Date.now() < deadline) await pause(1000)
  assert.ok(existsSync('/qa/shared/offer.json'), 'Browser offer was not supplied')
  assert.ok(existsSync('/qa/shared/media-ready.json'), 'Browser must acknowledge audio availability and arm immediate SDP delivery')
  const offer = JSON.parse(readFileSync('/qa/shared/offer.json', 'utf8'))
  const connected = await voice(request('/api/copilot/suara', offer, tokenA))
  const answer = await connected.json()
  assert.equal(connected.status, 200, JSON.stringify(answer))
  session = answer.sesi
  assert.equal((await voice(request('/api/copilot/suara', offer, tokenA))).status, 429)
  assert.equal((await voice(request('/api/copilot/suara', { henti: session }, tokenB))).status, 404)
  console.log('COPILOT_VOICE_ANSWER', JSON.stringify({ sdp: answer.sdp, had_saat: answer.had_saat }))
  pass('Realtime SDP, duplicate-call limit and owner-bound stop verified')
  const voiceDeadline = Date.now() + 180000
  while (!existsSync('/qa/shared/finish.json') && Date.now() < voiceDeadline) await pause(1000)
  assert.ok(existsSync('/qa/shared/finish.json'), 'Browser media acceptance not completed')
  const browser = JSON.parse(readFileSync('/qa/shared/finish.json', 'utf8'))
  assert.equal(browser.connected, true); assert.ok(browser.bytesReceived > 0)
  assert.ok(browser.inputTranscript); assert.ok(browser.outputTranscript)
  pass('Browser WebRTC synthetic speech input and generated audio output', browser)
} catch (error) {
  process.exitCode = 1
  console.log('COPILOT_LIVE_ERROR', JSON.stringify({ message: error instanceof Error ? error.message : 'Unknown error' }))
} finally {
  if (session) {
    const stopped = await voice(request('/api/copilot/suara', { henti: session }, tokenA)).catch(() => null)
    if (stopped?.status !== 200) process.exitCode = 1
    console.log('COPILOT_VOICE_STOP', stopped?.status ?? 'unavailable')
  }
  console.log('COPILOT_LIVE_RESULT', JSON.stringify({ success: !process.exitCode, checks, providerRequests }))
}
