import { NextResponse } from 'next/server'
import { askGemini, geminiKey } from '@/lib/gemini-text'
import {
  clipTurns,
  localPenasihat,
  originAllowed,
  parsePenasihatReply,
  penasihatPrompt,
  penasihatStage,
  tooManyNotes,
} from '@/lib/penasihat'

export const maxDuration = 60
export const runtime = 'nodejs'

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && originAllowed(origin) ? origin : 'https://beshareaisolution.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

function clientKey(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'tempatan'
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin')
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)
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
    return NextResponse.json({ error: 'Sila hantar butiran perniagaan.' }, { status: 400, headers })
  }

  const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const nama = typeof data.nama === 'string' ? data.nama.replace(/\s+/g, ' ').trim().slice(0, 80) : ''
  const jualan = typeof data.jualan === 'string' ? data.jualan.replace(/\s+/g, ' ').trim().slice(0, 240) : ''
  const peringkat = penasihatStage(data.peringkat)
  const giliran = clipTurns(data.giliran)
  const terakhir = giliran.at(-1)
  if (nama.length < 2 || jualan.length < 8 || !peringkat || terakhir?.dari !== 'klien') {
    return NextResponse.json({ error: 'Sila lengkapkan butiran perniagaan dan tulis mesej.' }, { status: 400, headers })
  }

  const soalan = { nama, jualan, peringkat, giliran }
  try {
    if (!geminiKey()) throw new Error('tiada kunci')
    const text = await askGemini(penasihatPrompt(soalan), { json: true, timeoutMs: 22000 })
    const reply = parsePenasihatReply(text)
    return NextResponse.json({ ok: true, ...reply }, { headers })
  } catch (error) {
    console.warn('Penasihat sandaran digunakan.', error instanceof Error ? error.message : error)
    return NextResponse.json({ ok: true, ...localPenasihat(soalan) }, { headers })
  }
}
