import { NextResponse } from 'next/server'
import { askGemini, geminiKey } from '@/lib/gemini-text'
import { createKuotaClient } from '@/lib/copilot-kuta'
import { askPublicOnce } from '@/lib/copilot-model'
import { advisePublicQuota } from '@/lib/penasihat-kuota'
import {
  clipTurns,
  localPenasihat,
  originAllowed,
  parsePenasihatReply,
  penasihatHeaders,
  penasihatPrompt,
  penasihatStage,
  tooManyNotes,
  type PenasihatStage,
  type PenasihatTurn,
} from '@/lib/penasihat'

export const maxDuration = 60
export const runtime = 'nodejs'

function corsHeaders(origin: string | null) {
  return penasihatHeaders(origin)
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
  // PENASIHAT_AWAM_TUTUP: perlindungan MATI kecuali nilai tepat "on".
  // Mati: POST /api/penasihat kekal, termasuk PENASIHAT_KUOTA. Jangan tetapkan dalam produksi.
  // Hidup: panggilan awam ditolak di sini, sebelum Gemini dan sebelum kuota.
  // Gulung balik: buang pemboleh ubah, atau tetapkan apa-apa nilai selain "on".
  // Laluan suara dan POST /api/copilot/nasihat tidak menggunakan suis ini.
  if (process.env.PENASIHAT_AWAM_TUTUP === 'on') {
    return NextResponse.json(
      { error: 'Nasihat awam ditutup. Guna meja akaun.' },
      { status: 403, headers },
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
  if (process.env.PENASIHAT_KUOTA === 'on') {
    return postDenganKuota(soalan, headers)
  }
  return jawapanSediaAda(soalan, headers)
}

async function jawapanSediaAda(
  soalan: { nama: string; jualan: string; peringkat: PenasihatStage; giliran: PenasihatTurn[] },
  headers: HeadersInit,
) {
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

async function postDenganKuota(
  soalan: { nama: string; jualan: string; peringkat: PenasihatStage; giliran: PenasihatTurn[] },
  headers: HeadersInit,
) {
  if (!geminiKey()) {
    return NextResponse.json({ ok: true, ...localPenasihat(soalan) }, { headers })
  }
  const result = await advisePublicQuota({
    soalan,
    kuota: createKuotaClient({
      akaunUrl: process.env.COPILOT_AKAUN_URL,
      secret: process.env.COPILOT_KUTA_SECRET,
    }),
    ask: (prompt) => askPublicOnce(prompt),
  })
  return NextResponse.json(result.body, { status: result.status, headers })
}
