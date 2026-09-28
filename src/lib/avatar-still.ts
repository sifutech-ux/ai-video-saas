import type { UgcDirection } from './ugc-direction'

export const AVATAR_NOTE_MISS = 'Sila tulis gambaran avatar: jantina, umur, dan baju.'
export const AVATAR_MINOR = 'Sila tulis gambaran orang dewasa sahaja. Avatar AI tidak mencipta kanak-kanak.'

const NOTE_LIMIT = 240

const MINOR_WORD =
  /\b(child|children|kid|kids|toddler|toddlers|baby|babies|infant|infants|minor|minors|underage|preteen|preteens|teenager|teenagers|teen|teens|schoolgirl|schoolboy|loli|shota|budak|bayi|remaja|kanak-kanak|tadika|kindergarten)\b|kanak\s*kanak|anak\s*kecil|anak-anak|bawah\s*18|under\s*18|kurang\s*dari\s*18|sekolah\s*rendah/i

const SCENE: Record<UgcDirection, string> = {
  santai: 'in a simple bright room, casual UGC tabletop behind them',
  live: 'at a bright live-selling table with a ring light',
  kecantikan: 'in a soft vanity close-up',
  pelancaran: 'beside a premium product pedestal in soft light',
}

export function presenterMode(value: unknown): 'muka' | 'avatar' {
  return value === 'avatar' ? 'avatar' : 'muka'
}

export function minorAvatarNote(value: string) {
  if (MINOR_WORD.test(value)) return true
  const ages = [
    ...value.matchAll(/\b(?:umur|usia|age)\s*:?\s*(\d{1,3})\b/gi),
    ...value.matchAll(/\b(\d{1,3})\s*(?:tahun|years?(?:\s*old)?|yo|y\.o\.)\b/gi),
  ]
  return ages.some((match) => {
    const age = Number(match[1])
    return age > 0 && age < 18
  })
}

export function adultAvatarNote(value: unknown) {
  const clean = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (clean.length < 8) throw new Error(AVATAR_NOTE_MISS)
  if (minorAvatarNote(clean)) throw new Error(AVATAR_MINOR)
  return clean.slice(0, NOTE_LIMIT)
}

export function avatarStillPrompt(direction: UgcDirection, note: string) {
  const clean = adultAvatarNote(note)
  return `Photorealistic photo of one adult person only, ${SCENE[direction]}. The adult matches this description: ${clean}. Waist-up, looking at the camera, natural skin, real photograph. Adult, not a child. Vertical 9:16. No text, no logo, no extra people.`
}
