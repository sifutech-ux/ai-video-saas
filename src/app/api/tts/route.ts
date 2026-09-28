import { NextResponse } from 'next/server'
import { denied, requireStudio } from '@/lib/studio-guard'
import { synthesizeMalay } from '@/lib/malay-voice'

export const maxDuration = 30
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await requireStudio()
  if (denied(session)) return session

  try {
    const body = await req.json().catch(() => ({}))
    const text = typeof body.text === 'string' ? body.text : ''
    const audio = await synthesizeMalay(text)
    return new NextResponse(new Uint8Array(audio.buffer), {
      headers: {
        'Content-Type': audio.mime,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menjana audio suara.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
