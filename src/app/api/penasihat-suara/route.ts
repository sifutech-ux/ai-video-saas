import { NextResponse } from 'next/server'
import { originAllowed, tooManyNotes } from '@/lib/penasihat'
import { speakAdvice } from '@/lib/penasihat-suara'
import { copilotHeaders, fetchCopilotSession } from '@/lib/copilot-nasihat'
import { speakOpenAI } from '@/lib/copilot-openai'

export const maxDuration = 60
export const runtime = 'nodejs'

function clientKey(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'tempatan'
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: copilotHeaders(req.headers.get('origin')) })
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  const headers = copilotHeaders(origin)
  if (!originAllowed(origin)) {
    return NextResponse.json({ error: 'Permintaan ini tidak diterima.' }, { status: 403, headers })
  }
  // The deployed Copilot account service authenticates speech before any paid call.
  // Legacy Studio installations without COPILOT_AKAUN_URL retain their existing route.
  const akaunUrl = process.env.COPILOT_AKAUN_URL
  if (akaunUrl || process.env.COPILOT_AI_PROVIDER === 'openai') {
    const authorization = req.headers.get('authorization') || ''
    if (!/^Bearer\s+\S{1,400}$/i.test(authorization)) {
      return NextResponse.json({ error: 'Sila masuk akaun dahulu.' }, { status: 401, headers })
    }
    if (!akaunUrl) return NextResponse.json({ error: 'Akaun tidak dapat disahkan.' }, { status: 503, headers })
    const session = await fetchCopilotSession(akaunUrl, authorization)
    if (!session.ok) return NextResponse.json({ error: 'Akaun tidak dapat disahkan.' }, { status: session.status, headers })
    if (!session.penasihat) return NextResponse.json({ error: 'Lengkapkan profil perniagaan dahulu.' }, { status: 422, headers })
    if (tooManyNotes(`suara:${session.akaunId}`)) return NextResponse.json({ error: 'Tunggu seminit sebelum mendengar lagi.' }, { status: 429, headers })
  }
  if (tooManyNotes(clientKey(req))) {
    return NextResponse.json(
      { error: 'Terlalu banyak mesej sebentar. Tunggu seminit, kemudian hantar sekali lagi.' },
      { status: 429, headers },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Tiada ayat untuk dibaca.' }, { status: 400, headers })
  }
  const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const jawapan = typeof data.jawapan === 'string' ? data.jawapan : ''
  const langkah = Array.isArray(data.langkah) ? data.langkah.filter((item): item is string => typeof item === 'string') : []
  if (jawapan.trim().length < 2 || jawapan.length > 4000 || langkah.length > 5 || langkah.some((item) => item.length > 600)) {
    return NextResponse.json({ error: 'Tiada ayat untuk dibaca.' }, { status: 400, headers })
  }

  try {
    const spoken = process.env.COPILOT_AI_PROVIDER === 'openai'
      ? await speakOpenAI([jawapan, ...langkah.map((line, index) => `Langkah ${index + 1}. ${line}`)].join(' ').slice(0, 5500))
      : await speakAdvice(jawapan, langkah, Boolean(akaunUrl))
    return NextResponse.json({ ok: true, ...spoken }, { headers })
  } catch (error) {
    console.warn('Suara penasihat tidak dijana.')
    return NextResponse.json(
      { error: 'Suara belum dapat didengar. Cuba sekali lagi, atau baca jawapan di skrin.' },
      { status: 503, headers },
    )
  }
}
