import { NextResponse } from 'next/server'
import { denied, requireStudio } from '@/lib/studio-guard'
import { writeSession } from '@/lib/studio-cookie'
import { ownsJob, settleJob } from '@/lib/studio-session'

export async function POST(req: Request) {
  const session = await requireStudio()
  if (denied(session)) return session

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  const hasil = body.hasil === 'siap' ? 'siap' : body.hasil === 'gagal' ? 'gagal' : ''
  if (!id || !hasil) {
    return NextResponse.json({ error: 'Tugasan tidak lengkap.' }, { status: 400 })
  }
  if (!ownsJob(session, id)) {
    return NextResponse.json({ error: 'Tugasan ini bukan milik sesi anda.' }, { status: 403 })
  }

  const settled = settleJob(session, id, hasil)
  if (settled.changed) await writeSession(session)
  return NextResponse.json({ ok: true, credits: settled.credits })
}
