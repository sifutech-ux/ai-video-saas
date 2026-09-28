import { NextResponse } from 'next/server'
import { readSession, studioConfigured } from './studio-cookie'
import type { StudioSession } from './studio-session'

export async function requireStudio(): Promise<StudioSession | NextResponse> {
  if (!studioConfigured()) {
    return NextResponse.json(
      { error: 'Studio dikunci. Kata laluan pelayan belum ditetapkan.' },
      { status: 503 }
    )
  }
  const session = await readSession()
  if (!session) {
    return NextResponse.json({ error: 'Sila masuk dahulu.' }, { status: 401 })
  }
  return session
}

export function denied(result: StudioSession | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}
