import { randomBytes } from 'node:crypto'
import { copilotHeaders, fetchCopilotSession } from '@/lib/copilot-nasihat'
import { originAllowed, tooManyNotes } from '@/lib/penasihat'
import { accountRequest, fetchBusinessContext } from '@/lib/copilot-intelligence'
import { copilotOpenAIKey } from '@/lib/copilot-openai'
import { createRealtimeCall, hangupRealtime } from '@/lib/copilot-realtime'

export const runtime = 'nodejs'
export const maxDuration = 60
// This route runs in the persistent Copilot Docker server, not an ephemeral function.
const calls = new Map<string, { owner: string; callId: string; timer: ReturnType<typeof setTimeout> }>()
const pending = new Set<string>()

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: copilotHeaders(req.headers.get('origin')) })
}
export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  const headers = copilotHeaders(origin)
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers })
  if (!originAllowed(origin)) return json({ error: 'Permintaan tidak diterima.' }, 403)
  const authorization = req.headers.get('authorization') || ''
  if (!/^Bearer\s+\S{1,400}$/.test(authorization)) return json({ error: 'Sila masuk akaun dahulu.' }, 401)
  const url = process.env.COPILOT_AKAUN_URL
  if (!url || !copilotOpenAIKey()) return json({ error: 'Suara belum disambungkan.' }, 503)
  const session = await fetchCopilotSession(url, authorization)
  if (!session.ok) return json({ error: 'Akaun tidak dapat disahkan.' }, session.status)
  let body
  try {
    const raw = await req.text()
    if (raw.length > 50000) return json({ error: 'Permintaan terlalu besar.' }, 413)
    body = JSON.parse(raw)
  } catch { return json({ error: 'Permintaan tidak sah.' }, 400) }
  if (body?.henti) {
    const call = calls.get(body.henti)
    if (!call || call.owner !== session.akaunId) return json({ error: 'Sesi tidak ditemui.' }, 404)
    try { await hangupRealtime(call.callId) } catch { return json({ error: 'Penutupan suara belum disahkan.' }, 503) }
    clearTimeout(call.timer); calls.delete(body.henti)
    return json({ ok: true })
  }
  if (!session.penasihat) return json({ error: 'Lengkapkan profil dahulu.' }, 422)
  if (typeof body?.sdp !== 'string' || !body.sdp.startsWith('v=0') || body.sdp.length > 40000) return json({ error: 'Sambungan suara tidak sah.' }, 400)
  if (process.env.COPILOT_REALTIME_ENABLED !== 'true') return json({ error: 'Perbualan suara sedang disediakan.' }, 503)
  if (pending.has(session.akaunId) || [...calls.values()].some(c => c.owner === session.akaunId)
    || tooManyNotes(`realtime:${session.akaunId}`)) return json({ error: 'Tamatkan sesi suara sebelum membuka sesi baharu.' }, 429)
  pending.add(session.akaunId)
  try {
    const context = await fetchBusinessContext(url, authorization)
    await accountRequest(url, authorization, '/api/akaun/copilot/suara/rezab', {})
    const call = await createRealtimeCall(body.sdp, session.penasihat, context)
    const id = randomBytes(16).toString('hex')
    const timer = setTimeout(async () => {
      try { await hangupRealtime(call.callId); calls.delete(id) }
      catch { /* Keep owner locked; browser can retry closing. Do not log account data. */ }
    }, 300000)
    timer.unref()
    calls.set(id, { owner: session.akaunId, callId: call.callId, timer })
    return json({ ok: true, sdp: call.sdp, sesi: id, had_saat: 300 })
  } catch (error) {
    return json({ error: error instanceof Error && error.message === 'voice_limit'
      ? 'Had sesi suara hari ini telah digunakan.' : 'Suara belum dapat disambungkan. Cuba lagi kemudian.' },
      error instanceof Error && error.message === 'voice_limit' ? 429 : 503)
  } finally { pending.delete(session.akaunId) }
}
