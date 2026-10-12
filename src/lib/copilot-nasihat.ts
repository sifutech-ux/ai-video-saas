import { accountEndpoint, mapKuotaFailure, type KuotaClient } from './copilot-kuta'
import {
  clipTurns,
  localPenasihat,
  originAllowed,
  parsePenasihatReply,
  penasihatPrompt,
  penasihatStage,
  tooManyNotes,
  type PenasihatReply,
  type PenasihatStage,
} from './penasihat'

/**
 * Laluan Copilot yang dilindungi.
 * Pelayan nasihat hanya membaca COPILOT_AKAUN_URL.
 * Rahsia tandatangan akaun dan token bot Telegram tidak dibaca di sini.
 * Bearer yang dihantar semula ialah token sesi pengguna, bukan kelayakan perkhidmatan.
 */

export type CopilotContext = {
  nama: string
  jualan: string
  peringkat: PenasihatStage
}

export type CopilotSession =
  | { ok: true; akaunId: string; exp: number; penasihat: CopilotContext | null }
  | { ok: false; status: 401 | 503 }

const TEMPATAN = 'Panduan tempatan, bukan jawapan model.'

export function copilotHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && originAllowed(origin) ? origin : 'https://beshareaisolution.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}

export function copilotSessionUrl(akaunUrl: string, options?: { testLoopback?: boolean }) {
  return accountEndpoint(akaunUrl, '/api/akaun/copilot/sesi', options?.testLoopback === true)
}

function accountId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9]{16,64}$/.test(value) ? value : null
}

function readContext(value: unknown): CopilotContext | null | undefined {
  if (value === null) return null
  if (!value || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  const nama = typeof row.nama === 'string' ? row.nama : ''
  const jualan = typeof row.jualan === 'string' ? row.jualan : ''
  const peringkat = penasihatStage(row.peringkat)
  if (nama.length < 2 || nama.length > 80 || jualan.length < 8 || jualan.length > 240 || !peringkat) return undefined
  return { nama, jualan, peringkat }
}

export function parseCopilotSession(data: unknown, nowMs: number): CopilotSession {
  if (!data || typeof data !== 'object') return { ok: false, status: 503 }
  const row = data as Record<string, unknown>
  const akaunId = accountId(row.akaun_id)
  if (row.ok !== true || !akaunId || typeof row.exp !== 'number' || !Number.isInteger(row.exp)) {
    return { ok: false, status: 503 }
  }
  if (row.exp * 1000 < nowMs - 60_000) return { ok: false, status: 401 }
  if (!Object.prototype.hasOwnProperty.call(row, 'penasihat')) return { ok: false, status: 503 }
  const penasihat = readContext(row.penasihat)
  if (penasihat === undefined) return { ok: false, status: 503 }
  return { ok: true, akaunId, exp: row.exp, penasihat }
}

export async function fetchCopilotSession(
  akaunUrl: string,
  authorization: string,
  fetchImpl: typeof fetch = globalThis.fetch,
  nowMs = Date.now(),
): Promise<CopilotSession> {
  const endpoint = copilotSessionUrl(akaunUrl)
  if (!endpoint) return { ok: false, status: 503 }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: authorization },
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    })
    if (response.status === 401) return { ok: false, status: 401 }
    if (!response.ok) return { ok: false, status: 503 }
    return parseCopilotSession(await response.json(), nowMs)
  } catch {
    return { ok: false, status: 503 }
  } finally {
    clearTimeout(timer)
  }
}

function bearer(value: string | null) {
  if (!value) return null
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim())
  if (!match || match[1].length > 400) return null
  return `Bearer ${match[1]}`
}

function errorBody(error: string) {
  return { error }
}

function tempatan(ralat: 'model_gagal' | 'output_tidak_sah', soalan: Parameters<typeof localPenasihat>[0]) {
  const sandaran = localPenasihat(soalan)
  return {
    ok: false,
    sumber: 'tempatan',
    bukan_model: true,
    ralat,
    label: TEMPATAN,
    jawapan: sandaran.jawapan,
    langkah: sandaran.langkah,
  }
}

function geminiBody(reply: PenasihatReply) {
  return {
    ok: true,
    sumber: 'gemini',
    bukan_model: false,
    jawapan: reply.jawapan,
    langkah: [reply.langkah[0], reply.langkah[1], reply.langkah[2]],
  }
}

const IDEM_RE = /^[A-Za-z0-9_-]{16,64}$/

type ModelOnce = {
  text: string
  model: string | null
  promptTokens: number | null
  outputTokens: number | null
}

function hasilRalat(error: unknown) {
  if (error && typeof error === 'object' && 'kind' in error && (error as { kind?: string }).kind === 'uncertain') {
    return 'uncertain' as const
  }
  return 'provider_failed' as const
}

async function simpan(kuota: KuotaClient, input: Parameters<KuotaClient['muktamad']>[0]) {
  let last = await kuota.muktamad(input)
  for (let n = 0; n < 2 && !last.ok && last.status >= 500; n += 1) {
    last = await kuota.muktamad(input)
  }
  return last
}

export async function adviseCopilot(input: {
  origin: string | null
  authorization: string | null
  body: unknown
  rateKey: string
  akaunUrl: string | null | undefined
  idempotencyKey: string | null
  copilotKeyPresent: () => boolean
  now?: number
  introspect: (akaunUrl: string, authorization: string) => Promise<CopilotSession>
  kuota: KuotaClient
  ask: (prompt: string) => Promise<ModelOnce>
}) {
  if (!originAllowed(input.origin)) {
    return { status: 403, body: errorBody('Permintaan ini tidak diterima.') }
  }
  if (tooManyNotes(`copilot:${input.rateKey || 'tempatan'}`, input.now)) {
    return { status: 429, body: errorBody('Terlalu banyak mesej sebentar. Tunggu seminit, kemudian hantar sekali lagi.') }
  }
  const authorization = bearer(input.authorization)
  if (!authorization) return { status: 401, body: errorBody('Sila masuk akaun dahulu.') }
  const akaunUrl = input.akaunUrl?.trim()
  if (!akaunUrl || !copilotSessionUrl(akaunUrl)) {
    return { status: 503, body: errorBody('Akaun tidak dapat disahkan. Cuba semula.') }
  }

  let session: CopilotSession
  try {
    session = await input.introspect(akaunUrl, authorization)
  } catch {
    return { status: 503, body: errorBody('Akaun tidak dapat disahkan. Cuba semula.') }
  }
  if (!session.ok) {
    const status = session.status === 401 ? 401 : 503
    const error = status === 401 ? 'Sila masuk akaun dahulu.' : 'Akaun tidak dapat disahkan. Cuba semula.'
    return { status, body: errorBody(error) }
  }
  if (!session.penasihat) {
    return { status: 422, body: errorBody('Lengkapkan profil perniagaan dahulu.') }
  }

  const data = input.body && typeof input.body === 'object' ? (input.body as Record<string, unknown>) : null
  const giliran = clipTurns(data?.giliran)
  if (giliran.at(-1)?.dari !== 'klien') {
    return { status: 400, body: errorBody('Sila tulis mesej.') }
  }
  if (!input.idempotencyKey || !IDEM_RE.test(input.idempotencyKey)) {
    return { status: 400, body: errorBody('Permintaan tidak sah.') }
  }
  if (!input.copilotKeyPresent()) {
    return { status: 503, body: errorBody('Nasihat tidak sedia. Cuba semula.') }
  }

  const soalan = { ...session.penasihat, giliran }
  const reserved = await input.kuota.rezab({
    route: 'copilot_nasihat',
    idempotencyKey: input.idempotencyKey,
    giliran,
  })
  if (!reserved.ok) {
    const mapped = mapKuotaFailure(reserved.status, reserved.ralat)
    return { status: mapped.status, body: errorBody(mapped.error) }
  }
  if (reserved.status === 'settled') {
    return { status: 200, body: { ...geminiBody(reserved.reply), main_semula: true } }
  }
  const sending = await input.kuota.hantar(reserved.rezabId)
  if (!sending.ok) {
    const mapped = mapKuotaFailure(sending.status, sending.ralat)
    return { status: mapped.status, body: errorBody(mapped.error) }
  }

  try {
    const attempt = await input.ask(penasihatPrompt(soalan))
    let reply: PenasihatReply
    try {
      reply = parsePenasihatReply(attempt.text)
    } catch {
      await simpan(input.kuota, { rezabId: reserved.rezabId, hasil: 'provider_failed' })
      return { status: 502, body: tempatan('output_tidak_sah', soalan) }
    }
    const settled = await simpan(input.kuota, {
      rezabId: reserved.rezabId,
      hasil: 'settled',
      jawapan: reply.jawapan,
      langkah: reply.langkah,
      model: attempt.model,
      promptTokens: attempt.promptTokens,
      outputTokens: attempt.outputTokens,
    })
    if (!settled.ok) {
      return { status: 503, body: errorBody('Keputusan permintaan ini belum pasti.') }
    }
    return { status: 200, body: geminiBody(reply) }
  } catch (error) {
    await simpan(input.kuota, { rezabId: reserved.rezabId, hasil: hasilRalat(error) })
    return { status: 502, body: tempatan('model_gagal', soalan) }
  }
}
