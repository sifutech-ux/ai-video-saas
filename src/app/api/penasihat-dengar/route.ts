import { NextResponse } from 'next/server'
import { audioPayload, originAllowed, penasihatHeaders, tooManyNotes } from '@/lib/penasihat'
import { transcribeMalay } from '@/lib/penasihat-suara'

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
    return NextResponse.json({ error: 'Rakaman tidak lengkap. Cuba cakap sekali lagi.' }, { status: 400, headers })
  }
  const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const audio = audioPayload(data.audio, data.mime)
  if (!audio) {
    return NextResponse.json({ error: 'Rakaman tidak lengkap. Cuba cakap sekali lagi.' }, { status: 400, headers })
  }

  try {
    const teks = await transcribeMalay(audio.data, audio.mime)
    return NextResponse.json({ ok: true, teks }, { headers })
  } catch (error) {
    console.warn('Rakaman tidak ditranskrip.', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Suara tidak jelas. Cuba cakap sekali lagi, atau tulis mesej.' },
      { status: 422, headers },
    )
  }
}
