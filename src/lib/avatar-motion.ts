export const OMNI_MODEL = 'bytedance/omni-human-1.5'
export const SADTALKER_VERSION = '3aa3dac9353cc4d6bd62a8f95957bd844003b401ca4e4a9b33baa574c549d376'

export function omniHumanInput(image: string, audio: string) {
  return {
    image,
    audio,
    prompt:
      'A steady medium front shot. The same person looks at the camera, calm, and talks naturally. Smooth head and shoulder movement, continuous lip movement, face and clothes unchanged, one continuous shot, no jump cuts.',
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
