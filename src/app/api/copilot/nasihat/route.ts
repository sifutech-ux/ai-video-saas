import { NextResponse } from 'next/server'
import { adviseCopilot, copilotHeaders, fetchCopilotSession } from '@/lib/copilot-nasihat'
import { createKuotaClient } from '@/lib/copilot-kuta'
import { askCopilotOnce } from '@/lib/copilot-model'

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
  const authorization = req.headers.get('authorization')
  const akaunUrl = process.env.COPILOT_AKAUN_URL
  const result = await adviseCopilot({
    origin,
    authorization,
    body,
    rateKey: clientKey(req),
    akaunUrl,
    idempotencyKey: req.headers.get('idempotency-key'),
    copilotKeyPresent: () => Boolean(process.env.COPILOT_GEMINI_API_KEY),
    introspect: fetchCopilotSession,
    kuota: createKuotaClient({
      akaunUrl,
      secret: process.env.COPILOT_KUTA_SECRET,
      authorization,
    }),
    ask: (prompt) => askCopilotOnce(prompt),
  })
  return NextResponse.json(result.body, { status: result.status, headers: copilotHeaders(origin) })
}
