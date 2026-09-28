import { NextResponse } from 'next/server'
import { freshSession, sameSecret } from '@/lib/studio-session'
import { studioPassword, writeSession } from '@/lib/studio-cookie'

export async function POST(req: Request) {
  const password = studioPassword()
  if (!password) {
    return NextResponse.json(
      {
        error: 'Kata laluan studio belum ditetapkan pada pelayan. Tambah BESHARE_VIDEO_PASSWORD di Vercel, kemudian deploy semula.',
        configured: false,
      },
      { status: 503 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const given = typeof body.password === 'string' ? body.password : ''
  if (!given || !sameSecret(given, password)) {
    return NextResponse.json({ error: 'Kata laluan tidak tepat.' }, { status: 401 })
  }

  const session = freshSession()
  await writeSession(session)
  return NextResponse.json({ ok: true, credits: session.credits })
}
