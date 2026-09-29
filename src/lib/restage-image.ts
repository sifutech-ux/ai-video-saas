export const SCENE_MODEL = 'black-forest-labs/flux-kontext-pro'
export const AVATAR_STILL_MODEL = 'black-forest-labs/flux-1.1-pro'
export const HOLD_MODEL = 'flux-kontext-apps/multi-image-kontext-pro'
export const SCENE_MISS = 'Scene baharu tidak tersusun. Sila cuba sekali lagi.'
export const AVATAR_STILL_MISS = 'Avatar tidak dapat dicipta sekarang. Sila cuba sekali lagi.'
export const HOLD_MISS = 'Produk tidak dapat diletakkan di tangan penyampai. Sila cuba sekali lagi.'

type ScenePrediction = {
  id: string
  status: string
  output?: unknown
}

type ScenePredictor = {
  predictions: {
    create: (body: { model: string; input: Record<string, unknown> }) => Promise<ScenePrediction>
    get: (id: string) => Promise<ScenePrediction>
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function sceneOutputUrl(output: unknown): string | null {
  const value = Array.isArray(output) ? output[0] : output
  if (typeof value === 'string' && value.startsWith('https://')) return value
  if (value && typeof value === 'object') {
    const record = value as { href?: string; url?: () => { href?: string } | string }
    if (typeof record.url === 'function') {
      const url = record.url()
      const href = typeof url === 'string' ? url : url?.href
      if (typeof href === 'string' && href.startsWith('https://')) return href
    }
    if (typeof record.href === 'string' && record.href.startsWith('https://')) return record.href
  }
  return null
}

export async function restageImage(
  predictor: ScenePredictor,
  imageUrl: string,
  instruction: string,
  waitMs = 38000
) {
  if (!imageUrl.startsWith('https://')) throw new Error(SCENE_MISS)
  let current = await predictor.predictions.create({
    model: SCENE_MODEL,
    input: {
      prompt: instruction,
      input_image: imageUrl,
      aspect_ratio: '9:16',
      output_format: 'jpg',
      prompt_upsampling: false,
    },
  })
  const deadline = Date.now() + waitMs
  while (current.status !== 'succeeded' && current.status !== 'failed' && current.status !== 'canceled') {
    if (Date.now() >= deadline) throw new Error(SCENE_MISS)
    await sleep(1500)
    current = await predictor.predictions.get(current.id)
  }
  const url = current.status === 'succeeded' ? sceneOutputUrl(current.output) : null
  if (!url) throw new Error(SCENE_MISS)
  return url
}

export function holdProductPrompt() {
  return 'The adult in the first image holds the exact product pack from the second image in one hand at chest height. The pack is small, label facing the camera, logo and colors unchanged. Real fingers and a natural grip, with shadows that match the light. Keep this exact face, clothes, age, and the simple background. Natural skin with pores, real fabric, photoreal phone photo. No crowd, no shop, no signs, no extra people, no extra text. Vertical 9:16.'
}

function stillFailure(error: unknown, miss: string) {
  const text = error instanceof Error ? error.message : ''
  if (/Unauthenticated|authentication token/i.test(text)) return error instanceof Error ? error : new Error(text)
  console.warn('Gambar penyampai gagal.', text || error)
  return new Error(miss)
}

async function waitForScene(predictor: ScenePredictor, current: ScenePrediction, waitMs: number, miss: string) {
  const deadline = Date.now() + waitMs
  let latest = current
  while (latest.status !== 'succeeded' && latest.status !== 'failed' && latest.status !== 'canceled') {
    if (Date.now() >= deadline) throw new Error(miss)
    await sleep(1500)
    try {
      latest = await predictor.predictions.get(latest.id)
    } catch (error) {
      throw stillFailure(error, miss)
    }
  }
  const url = latest.status === 'succeeded' ? sceneOutputUrl(latest.output) : null
  if (!url) throw new Error(miss)
  return url
}

export async function createAvatarStill(predictor: ScenePredictor, prompt: string, waitMs = 22000) {
  let current: ScenePrediction
  try {
    current = await predictor.predictions.create({
      model: AVATAR_STILL_MODEL,
      input: {
        prompt,
        aspect_ratio: '9:16',
        output_format: 'jpg',
        output_quality: 95,
        prompt_upsampling: false,
        safety_tolerance: 2,
      },
    })
  } catch (error) {
    throw stillFailure(error, AVATAR_STILL_MISS)
  }
  return waitForScene(predictor, current, waitMs, AVATAR_STILL_MISS)
}

export async function holdProduct(
  predictor: ScenePredictor,
  personUrl: string,
  productUrl: string,
  prompt = holdProductPrompt(),
  waitMs = 36000
) {
  if (!personUrl.startsWith('https://') || !productUrl.startsWith('https://')) throw new Error(HOLD_MISS)
  let current: ScenePrediction
  try {
    current = await predictor.predictions.create({
      model: HOLD_MODEL,
      input: {
        prompt,
        input_image_1: personUrl,
        input_image_2: productUrl,
        aspect_ratio: 'match_input_image',
        output_format: 'png',
        safety_tolerance: 2,
      },
    })
  } catch (error) {
    throw stillFailure(error, HOLD_MISS)
  }
  return waitForScene(predictor, current, waitMs, HOLD_MISS)
}
