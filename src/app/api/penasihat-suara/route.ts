import { NextResponse } from 'next/server'
import { originAllowed, penasihatHeaders, tooManyNotes } from '@/lib/penasihat'
import { speakAdvice } from '@/lib/penasihat-suara'

export const maxDuration = 60
export const runtime = 'nodejs'

function clientKey(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'tempatan'
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: penasihatHeaders(req.headers.get('origin')) })
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  const headers = penasihatHeaders(origin)
  if (!originAllowed(origin)) {
    return NextResponse.json({ error: 'Permintaan ini tidak diterima.' }, { status: 403, headers })
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
  if (jawapan.trim().length < 2) {
    return NextResponse.json({ error: 'Tiada ayat untuk dibaca.' }, { status: 400, headers })
  }

  try {
    const spoken = await speakAdvice(jawapan, langkah)
    return NextResponse.json({ ok: true, ...spoken }, { headers })
  } catch (error) {
    console.warn('Suara penasihat tidak dijana.', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Suara belum dapat didengar. Cuba sekali lagi, atau baca jawapan di skrin.' },
      { status: 503, headers },
    )
  }
}
