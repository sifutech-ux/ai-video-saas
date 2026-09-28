export const SCENE_MODEL = 'black-forest-labs/flux-kontext-pro'
export const SCENE_MISS = 'Scene baharu tidak tersusun. Sila cuba sekali lagi.'

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
