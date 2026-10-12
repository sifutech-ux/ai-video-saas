import { createHash, createHmac, randomBytes } from 'node:crypto'

/** Hos akaun yang diluluskan untuk operasi produksi. */
export const ACCOUNT_HOST = 'beshare-ipo-bot.onrender.com'

const REZAB = '/api/akaun/copilot/kuota/rezab'
const HANTAR = '/api/akaun/copilot/kuota/hantar'
const MUKTAMAD = '/api/akaun/copilot/kuota/muktamad'

export type KuotaReply = {
  jawapan: string
  langkah: [string, string, string]
}

export type KuotaRezab =
  | { ok: true; status: 'reserved'; rezabId: string }
  | { ok: true; status: 'settled'; rezabId: string; mainSemula: true; reply: KuotaReply }
  | { ok: false; status: number; ralat: string }

export type KuotaHantar =
  | { ok: true; status: 'sending'; rezabId: string }
  | { ok: false; status: number; ralat: string }

export type KuotaMuktamad =
  | { ok: true; status: string }
  | { ok: false; status: number; ralat: string }

export type KuotaClient = {
  rezab(input: {
    route: 'copilot_nasihat' | 'penasihat_awam'
    idempotencyKey: string
    giliran: Array<{ dari: 'klien' | 'penasihat'; teks: string }>
    nama?: string
    jualan?: string
    peringkat?: string
  }): Promise<KuotaRezab>
  hantar(rezabId: string): Promise<KuotaHantar>
  muktamad(input: {
    rezabId: string
    hasil: 'settled' | 'provider_failed' | 'uncertain' | 'released'
    jawapan?: string
    langkah?: [string, string, string]
    model?: string | null
    promptTokens?: number | null
    outputTokens?: number | null
  }): Promise<KuotaMuktamad>
}

function privateHost(host: string) {
  const name = host.toLowerCase()
  if (name === 'localhost' || name.endsWith('.localhost') || name === '::1') return true
  if (name.startsWith('fc') || name.startsWith('fd') || name.startsWith('fe80')) return true
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(name)
  if (!match) return false
  const parts = match.slice(1).map(Number)
  if (parts.some((part) => part > 255)) return true
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

export function accountEndpoint(akaunUrl: string, path: string, testLoopback = false) {
  let url: URL
  try {
    url = new URL(akaunUrl)
  } catch {
    return null
  }
  if (url.username || url.password || url.search || url.hash) return null
  if (url.pathname !== '/' && url.pathname !== '') return null
  const host = url.hostname.toLowerCase()
  const loopback =
    testLoopback === true &&
    process.env.NODE_ENV !== 'production' &&
    (host === '127.0.0.1' || host === 'localhost') &&
    url.protocol === 'http:'
  if (!loopback) {
    if (url.protocol !== 'https:') return null
    if (host !== ACCOUNT_HOST) return null
    if (url.port && url.port !== '443') return null
    if (privateHost(host)) return null
  }
  if (!path.startsWith('/') || path.includes('?') || path.includes('#')) return null
  url.pathname = path
  url.search = ''
  url.hash = ''
  url.username = ''
  url.password = ''
  return url.toString()
}

export function copilotSignature(secret: string, method: string, path: string, body: Uint8Array, masa: number, nonce: string) {
  const digest = createHash('sha256').update(body).digest('hex')
  const signed = `${masa}.${nonce}.${method.toUpperCase()}.${path}.${digest}`
  return createHmac('sha256', secret).update(signed).digest('hex')
}

export function mapKuotaFailure(status: number, ralat: string) {
  if (ralat === 'had' || status === 429) {
    return { status: 429, error: 'Kuota nasihat penuh. Cuba lagi kemudian.' }
  }
  if (ralat === 'kunci_berbeza') {
    return { status: 409, error: 'Kunci permintaan ini sudah digunakan.' }
  }
  if (ralat === 'menunggu' || status === 409) {
    return { status: 409, error: 'Permintaan ini masih diproses.' }
  }
  if (ralat === 'tidak_pasti' || ralat === 'simpanan_tidak_pasti') {
    return { status: 503, error: 'Keputusan permintaan ini belum pasti.' }
  }
  return { status: 503, error: 'Akaun tidak dapat dihubungi. Cuba semula.' }
}

function bytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value))
}

function failure(status = 503, ralat = 'kuota_tidak_sedia'): { ok: false; status: number; ralat: string } {
  return { ok: false, status, ralat }
}

export function createKuotaClient(options: {
  akaunUrl: string | null | undefined
  secret: string | null | undefined
  authorization?: string | null
  fetchImpl?: typeof fetch
  now?: () => number
  testLoopback?: boolean
}): KuotaClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const secret = options.secret?.trim() || ''
  const akaunUrl = options.akaunUrl?.trim() || ''

  async function post(path: string, payload: unknown): Promise<{ status: number; data: Record<string, unknown> | null }> {
    const endpoint = accountEndpoint(akaunUrl, path, options.testLoopback === true)
    if (!endpoint || !secret) return { status: 503, data: null }
    const body = bytes(payload)
    const masa = Math.floor((options.now ?? Date.now)() / 1000)
    const nonce = randomBytes(16).toString('hex')
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Copilot-Masa': String(masa),
      'X-Copilot-Nonce': nonce,
      'X-Copilot-Tandatangan': copilotSignature(secret, 'POST', path, body, masa, nonce),
    }
    if (options.authorization) headers.Authorization = options.authorization
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5_000)
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body,
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      })
      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
      return { status: response.status, data }
    } catch {
      return { status: 503, data: null }
    } finally {
      clearTimeout(timer)
    }
  }

  function ralat(status: number, data: Record<string, unknown> | null) {
    const code = data && typeof data.ralat === 'string' ? data.ralat : 'kuota_tidak_sedia'
    return failure(status || 503, code)
  }

  return {
    async rezab(input) {
      const payload: Record<string, unknown> = {
        route: input.route,
        idempotency_key: input.idempotencyKey,
        giliran: input.giliran,
      }
      if (input.route === 'penasihat_awam') {
        payload.nama = input.nama
        payload.jualan = input.jualan
        payload.peringkat = input.peringkat
      }
      const { status, data } = await post(REZAB, payload)
      if (!data || data.ok !== true || typeof data.rezab_id !== 'string') return ralat(status, data)
      if (data.main_semula === true && data.status === 'settled') {
        const langkah = Array.isArray(data.langkah) ? data.langkah.filter((item): item is string => typeof item === 'string') : []
        if (typeof data.jawapan !== 'string' || langkah.length !== 3) return failure(503, 'tidak_pasti')
        return {
          ok: true,
          status: 'settled',
          rezabId: data.rezab_id,
          mainSemula: true,
          reply: { jawapan: data.jawapan, langkah: [langkah[0], langkah[1], langkah[2]] },
        }
      }
      if (data.status !== 'reserved') return failure(status || 503, 'tidak_pasti')
      return { ok: true, status: 'reserved', rezabId: data.rezab_id }
    },
    async hantar(rezabId) {
      const { status, data } = await post(HANTAR, { rezab_id: rezabId })
      if (!data || data.ok !== true || data.status !== 'sending') return ralat(status, data)
      return { ok: true, status: 'sending', rezabId }
    },
    async muktamad(input) {
      const payload: Record<string, unknown> = { rezab_id: input.rezabId, hasil: input.hasil }
      if (input.hasil === 'settled') {
        payload.jawapan = input.jawapan
        payload.langkah = input.langkah
        payload.model = input.model ?? null
        if (typeof input.promptTokens === 'number') payload.prompt_tokens = input.promptTokens
        if (typeof input.outputTokens === 'number') payload.output_tokens = input.outputTokens
      }
      const { status, data } = await post(MUKTAMAD, payload)
      if (!data || data.ok !== true) return ralat(status, data)
      return { ok: true, status: typeof data.status === 'string' ? data.status : input.hasil }
    },
  }
}
