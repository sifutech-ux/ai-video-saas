import { createHash, createHmac, timingSafeEqual } from 'crypto'

export const START_CREDITS = 2
export const SESSION_MS = 12 * 60 * 60 * 1000

export type StudioJob = {
  id: string
  charged: boolean
  settled: boolean
}

export type StudioSession = {
  exp: number
  credits: number
  jobs: StudioJob[]
}

export function sameSecret(given: string, expected: string) {
  const left = createHash('sha256').update(given).digest()
  const right = createHash('sha256').update(expected).digest()
  return timingSafeEqual(left, right)
}

export function freshSession(now = Date.now()): StudioSession {
  return {
    exp: now + SESSION_MS,
    credits: START_CREDITS,
    jobs: [],
  }
}

export function signSession(session: StudioSession, secret: string) {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function readSigned(token: string, secret: string, now = Date.now()): StudioSession | null {
  if (!token || !secret) return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const left = Buffer.from(sig)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as StudioSession
    if (!data || typeof data.exp !== 'number' || data.exp < now) return null
    if (typeof data.credits !== 'number' || !Number.isFinite(data.credits)) return null
    if (!Array.isArray(data.jobs)) return null
    return data
  } catch {
    return null
  }
}

export function ownsJob(session: StudioSession, jobId: string) {
  return session.jobs.some((job) => job.id === jobId)
}

export function rememberJob(session: StudioSession, jobId: string) {
  session.jobs = [
    ...session.jobs.filter((job) => job.id !== jobId),
    { id: jobId, charged: true, settled: false },
  ].slice(-30)
}

export function settleJob(session: StudioSession, jobId: string, hasil: 'siap' | 'gagal') {
  const job = session.jobs.find((item) => item.id === jobId)
  if (!job || !job.charged || job.settled) {
    return { changed: false, credits: session.credits }
  }
  job.settled = true
  if (hasil === 'gagal') {
    session.credits = Math.min(START_CREDITS, session.credits + 1)
  }
  return { changed: true, credits: session.credits }
}
