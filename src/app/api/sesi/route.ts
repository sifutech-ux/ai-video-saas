import { NextResponse } from 'next/server'
import { readSession, studioConfigured } from '@/lib/studio-cookie'

export async function GET() {
  if (!studioConfigured()) {
    return NextResponse.json({ ok: false, configured: false })
  }
  const session = await readSession()
  if (!session) {
    return NextResponse.json({ ok: false, configured: true })
  }
  return NextResponse.json({
    ok: true,
    configured: true,
    credits: session.credits,
    pending: session.jobs.filter((job) => !job.settled).map((job) => job.id),
  })
}
