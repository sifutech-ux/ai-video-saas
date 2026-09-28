import { cookies } from 'next/headers'
import {
  freshSession,
  readSigned,
  signSession,
  type StudioSession,
} from './studio-session'

const NAME = 'beshare_video'

export function studioPassword() {
  return process.env.BESHARE_VIDEO_PASSWORD || ''
}

export function studioConfigured() {
  return studioPassword().length > 0
}

function signingSecret() {
  return process.env.BESHARE_VIDEO_SECRET || studioPassword()
}

export async function readSession() {
  const jar = await cookies()
  const raw = jar.get(NAME)?.value
  if (!raw) return null
  return readSigned(raw, signingSecret())
}

export async function writeSession(session: StudioSession) {
  const jar = await cookies()
  jar.set(NAME, signSession(session, signingSecret()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(process.env.VERCEL),
    path: '/',
    maxAge: 60 * 60 * 12,
  })
}

export async function clearSession() {
  const jar = await cookies()
  jar.delete(NAME)
}

export { freshSession }
