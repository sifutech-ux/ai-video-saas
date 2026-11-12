import { randomBytes } from 'node:crypto'
import { mapKuotaFailure, type KuotaClient } from './copilot-kuta'
import { localPenasihat, penasihatPrompt, parsePenasihatReply, type PenasihatReply, type PenasihatStage, type PenasihatTurn } from './penasihat'

export type PublicQuestion = {
  nama: string
  jualan: string
  peringkat: PenasihatStage
  giliran: PenasihatTurn[]
}

type ModelOnce = {
  text: string
  model: string | null
  promptTokens: number | null
  outputTokens: number | null
}

function localBody(soalan: PublicQuestion) {
  return { ok: true, ...localPenasihat(soalan) }
}

function hasilRalat(error: unknown) {
  return error && typeof error === 'object' && 'kind' in error && (error as { kind?: string }).kind === 'uncertain'
    ? 'uncertain'
    : 'provider_failed'
}

async function simpan(
  kuota: KuotaClient,
  input: Parameters<KuotaClient['muktamad']>[0],
) {
  let last = await kuota.muktamad(input)
  for (let n = 0; n < 2 && !last.ok && last.status >= 500; n += 1) {
    last = await kuota.muktamad(input)
  }
  return last
}

export async function advisePublicQuota(input: {
  soalan: PublicQuestion
  kuota: KuotaClient
  ask: (prompt: string) => Promise<ModelOnce>
  idempotencyKey?: string
}) {
  const key = input.idempotencyKey && /^[A-Za-z0-9_-]{16,64}$/.test(input.idempotencyKey)
    ? input.idempotencyKey
    : randomBytes(16).toString('hex')
  const reserved = await input.kuota.rezab({
    route: 'penasihat_awam',
    idempotencyKey: key,
    giliran: input.soalan.giliran,
    nama: input.soalan.nama,
    jualan: input.soalan.jualan,
    peringkat: input.soalan.peringkat,
  })
  if (!reserved.ok) {
    const mapped = mapKuotaFailure(reserved.status, reserved.ralat)
    return { status: mapped.status, body: { error: mapped.error } }
  }
  if (reserved.status === 'settled') {
    return { status: 200, body: { ok: true, jawapan: reserved.reply.jawapan, langkah: reserved.reply.langkah } }
  }
  const sending = await input.kuota.hantar(reserved.rezabId)
  if (!sending.ok) {
    const mapped = mapKuotaFailure(sending.status, sending.ralat)
    return { status: mapped.status, body: { error: mapped.error } }
  }

  let reply: PenasihatReply
  try {
    const attempt = await input.ask(penasihatPrompt(input.soalan))
    reply = parsePenasihatReply(attempt.text)
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
      return { status: 503, body: { error: 'Keputusan permintaan ini belum pasti.' } }
    }
    return { status: 200, body: { ok: true, jawapan: reply.jawapan, langkah: reply.langkah } }
  } catch (error) {
    await simpan(input.kuota, { rezabId: reserved.rezabId, hasil: hasilRalat(error) })
    return { status: 200, body: localBody(input.soalan) }
  }
}
