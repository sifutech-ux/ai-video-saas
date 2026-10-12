import { NextResponse } from 'next/server'
import { askGemini } from '@/lib/gemini-text'
import { adviseCopilot, copilotHeaders, fetchCopilotSession } from '@/lib/copilot-nasihat'

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
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    body = null
  }
  const result = await adviseCopilot({
    origin,
    authorization: req.headers.get('authorization'),
    body,
    rateKey: clientKey(req),
    akaunUrl: process.env.COPILOT_AKAUN_URL,
    introspect: fetchCopilotSession,
    ask: (prompt) => askGemini(prompt, { json: true, timeoutMs: 22000 }),
  })
  return NextResponse.json(result.body, { status: result.status, headers: copilotHeaders(origin) })
}
