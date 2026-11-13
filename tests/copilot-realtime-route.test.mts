import assert from 'node:assert/strict'
import test from 'node:test'
import { POST } from '../src/app/api/copilot/suara/route.ts'

const url = 'https://nasihat.beshareaisolution.com/api/copilot/suara'
const request = (body: unknown, token = 'fixture-a', origin = 'https://beshareaisolution.com') => new Request(url, {
  method: 'POST', headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
})

test('realtime rejects forbidden origins and missing sessions before network', async () => {
  const old = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('must not call network') }
  try {
    assert.equal((await POST(request({ sdp: 'v=0' }, '', 'https://evil.example'))).status, 403)
    assert.equal((await POST(request({ sdp: 'v=0' }, ''))).status, 401)
  } finally { globalThis.fetch = old }
})

test('realtime reserves a persistent allowance, blocks duplicate session, and binds stop to owner', async () => {
  const old = globalThis.fetch, env = { ...process.env }; const calls: string[] = []
  process.env.COPILOT_AKAUN_URL = 'https://akaun.beshareaisolution.com'
  process.env.COPILOT_AKAUN_HOST = 'akaun.beshareaisolution.com'
  process.env.COPILOT_OPENAI_API_KEY = 'synthetic-fixture-key'
  process.env.COPILOT_REALTIME_ENABLED = 'true'
  globalThis.fetch = async (target, init) => {
    const path = String(target); calls.push(path)
    if (path.endsWith('/sesi')) return Response.json({ ok: true, akaun_id: new Headers(init?.headers).get('authorization')?.endsWith('fixture-b') ? 'b'.repeat(32) : 'a'.repeat(32),
      exp: 1999999999, penasihat: { nama: 'Kedai Ujian', jualan: 'Kopi untuk pekerja pejabat', peringkat: 'jual' } })
    if (path.endsWith('/konteks')) return Response.json({ ok: true, hari: '2026-11-13', minggu_mula: '2026-11-09', ingatan: { ingatan: {}, versi: 0 }, pelan: null, angka: {}, matlamat: null })
    if (path.endsWith('/rezab')) return Response.json({ ok: true })
    if (path.endsWith('/hangup')) return new Response(null, { status: 200 })
    if (path.endsWith('/realtime/calls')) return new Response('v=0\r\nanswer', { headers: { location: '/v1/realtime/calls/rtc_routefixture' } })
    throw new Error('Unexpected endpoint')
  }
  try {
    const result = await POST(request({ sdp: 'v=0\r\noffer', model: 'attacker-model' }))
    const body = await result.json()
    assert.equal(result.status, 200, JSON.stringify(body)); assert.equal(body.had_saat, 300)
    assert.ok(!JSON.stringify(body).includes('synthetic-fixture-key'))
    assert.ok(calls.find(x => x.endsWith('/suara/rezab')))
    assert.equal((await POST(request({ sdp: 'v=0\r\noffer' }))).status, 429)
    assert.equal((await POST(request({ henti: body.sesi }, 'fixture-b'))).status, 404)
    assert.equal((await POST(request({ henti: body.sesi }))).status, 200)
    assert.equal(calls.filter(x => x.endsWith('/realtime/calls')).length, 1)
  } finally {
    globalThis.fetch = old
    for (const name of ['COPILOT_AKAUN_URL', 'COPILOT_AKAUN_HOST', 'COPILOT_OPENAI_API_KEY', 'COPILOT_REALTIME_ENABLED']) {
      if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name]
    }
  }
})
