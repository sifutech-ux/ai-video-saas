import { NextResponse } from 'next/server'
import { adviseCopilot, copilotHeaders, fetchCopilotSession } from '@/lib/copilot-nasihat'
import { createKuotaClient } from '@/lib/copilot-kuta'
import { askMarketingOpenAIOnce, marketingOpenAIKey } from '@/lib/copilot-openai'
import { fetchBusinessContext } from '@/lib/copilot-intelligence'

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
  // Retain the shared account/quota contract while isolating the provider key.
  const result = await adviseCopilot({
    origin,
    authorization,
    body,
    rateKey: clientKey(req),
    akaunUrl,
    idempotencyKey: req.headers.get('idempotency-key'),
    copilotKeyPresent: () => Boolean(marketingOpenAIKey()),
    contextReader: fetchBusinessContext,
    introspect: fetchCopilotSession,
    kuota: createKuotaClient({
      akaunUrl,
      secret: process.env.COPILOT_KUTA_SECRET,
      authorization,
    }),
    ask: askMarketingOpenAIOnce,
  })
  return NextResponse.json(result.body, { status: result.status, headers: copilotHeaders(origin) })
}
