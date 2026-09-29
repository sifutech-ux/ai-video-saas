import type { UgcDirection } from './ugc-direction'

export const AVATAR_NOTE_MISS = 'Sila tulis gambaran avatar: jantina, umur, dan baju.'
export const AVATAR_MINOR = 'Sila tulis gambaran orang dewasa sahaja. Avatar AI tidak mencipta kanak-kanak.'

const NOTE_LIMIT = 240

const MINOR_WORD =
  /\b(child|children|kid|kids|toddler|toddlers|baby|babies|infant|infants|minor|minors|underage|preteen|preteens|teenager|teenagers|teen|teens|schoolgirl|schoolboy|loli|shota|budak|bayi|remaja|kanak-kanak|tadika|kindergarten)\b|kanak\s*kanak|anak\s*kecil|anak-anak|bawah\s*18|under\s*18|kurang\s*dari\s*18|sekolah\s*rendah/i

const SCENE: Record<UgcDirection, string> = {
  santai: 'in a simple quiet room, casual UGC tabletop, one plain table, no crowd',
  live: 'behind one plain table with one soft ring light, bright live-selling table, a simple quiet room, no shop, no crowd',
  kecantikan: 'in a soft vanity close-up at a simple dressing table, no crowd',
  pelancaran: 'beside a premium product pedestal in soft light, a quiet room, no crowd',
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

export function avatarHoldingPrompt(direction: UgcDirection, note: string) {
  const clean = adultAvatarNote(note)
  return `Photoreal live-action phone photo, vertical 9:16. One adult person holds this exact product pack, ${SCENE[direction]}. The adult matches this description exactly, including the clothes: ${clean}. If the description says a shirt or kemeja, it is a button shirt, not a t-shirt. The pack is small, in one hand at chest height, label facing the camera. Keep the pack logo and colors identical. Waist-up, looking at the camera. Natural skin with pores, real hair, real fabric, realistic fingers and grip. Soft real lighting. Adult, not a child. No plastic skin, no crowd, no shop, no signs, no extra text, no extra people.`
}

export function faceHoldPrompt(direction: UgcDirection) {
  return `Place the adult from the first image ${SCENE[direction]}. Waist-up, looking at the camera, holding the exact product pack from the second image in one hand at chest height. The pack is small, label facing the camera, logo and colors unchanged. Keep this exact face, age, and clothes. Natural skin with pores, real fingers, real grip. Photoreal phone photo. No crowd, no shop, no signs, no extra people, no extra text.`
}

export function avatarStillPrompt(direction: UgcDirection, note: string) {
  const clean = adultAvatarNote(note)
  return `Photoreal live-action phone photo, vertical 9:16, of one adult person only, ${SCENE[direction]}. The adult matches this description exactly, including the clothes: ${clean}. If the description says a shirt or kemeja, it is a button shirt, not a t-shirt. Waist-up, looking at the camera, both hands empty and visible. Natural skin with pores, real hair, real fabric, realistic hands. Soft real lighting. Adult, not a child. No plastic skin, no illustration, no crowd, no signs, no screens, no readable text, no logo, no watermark, no extra people.`
}
