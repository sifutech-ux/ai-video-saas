export const OMNI_MODEL = 'bytedance/omni-human-1.5'
export const SADTALKER_VERSION = '3aa3dac9353cc4d6bd62a8f95957bd844003b401ca4e4a9b33baa574c549d376'

const AVATAR_ENERGY = {
  santai: 'calm, and talks naturally',
  live: 'lively like a live-selling host, and talks directly',
  kecantikan: 'calm and close, and talks gently',
  pelancaran: 'quiet and premium, and talks slowly',
} as const

export function omniHumanInput(image: string, audio: string, direction: keyof typeof AVATAR_ENERGY = 'santai') {
  const energy = AVATAR_ENERGY[direction] ?? AVATAR_ENERGY.santai
  return {
    image,
    audio,
    prompt: `The person in this photo speaks to the camera while holding the product pack. Keep this exact face, clothes, product pack, and background. They look at the camera, ${energy}. Natural skin, real hands on the pack, smooth head and shoulder movement, continuous lip movement, one continuous shot, no jump cuts.`,
    fast_mode: false,
  }
}

export function sadTalkerInput(image: string, audio: string) {
  return {
    source_image: image,
    driven_audio: audio,
    enhancer: 'gfpgan',
    preprocess: 'full',
    still: false,
  }
}
