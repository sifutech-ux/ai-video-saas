export const STYLE_HINTS: Record<string, string> = {
  Cinematic: 'cinematic film still, anamorphic lens, shallow depth of field, motivated lighting, subtle film grain',
  Photorealistic: 'photorealistic, natural light, true-to-life texture, sharp detail',
  'Anime / Ghibli': 'hand-drawn anime, Studio Ghibli mood, painted backgrounds, soft color',
  '3D Render': 'polished 3D render, soft studio lighting, clean materials',
  Cyberpunk: 'cyberpunk night city, neon rain, reflective streets',
  'Vintage Film': 'vintage 16mm film, warm faded color, light dust, soft focus',
}

const ASPECTS = new Set(['16:9', '9:16', '1:1'])

export function cleanAspect(value: unknown) {
  return typeof value === 'string' && ASPECTS.has(value) ? value : '16:9'
}

export function fallbackPrompt(prompt: string, style: string, aspectRatio: string) {
  const hint = STYLE_HINTS[style] || 'cinematic, clear subject, natural motion'
  const subject = prompt.trim() || 'Animate the reference image with gentle continuous motion'
  return `${subject}. Visual style: ${hint}. Frame: ${aspectRatio}. One continuous shot, no on-screen text.`
}

export function ensureStyle(directed: string, style: string, aspectRatio: string) {
  const hint = STYLE_HINTS[style]
  const text = directed.trim()
  if (!hint) return text
  const hay = text.toLowerCase()
  const marker = hint.split(',')[0].trim().toLowerCase()
  if (hay.includes(marker) || hay.includes(style.toLowerCase())) return text
  return `${text} Visual style: ${hint}. Frame: ${aspectRatio}.`
}

function cleanModelText(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200)
}

export async function directStudioPrompt(input: {
  prompt: string
  style: string
  aspectRatio: string
}) {
  const aspectRatio = cleanAspect(input.aspectRatio)
  const fallback = fallbackPrompt(input.prompt, input.style, aspectRatio)
  const key = process.env.GEMINI_API_KEY
  if (!key) return fallback

  const instruction = `Write one text-to-video prompt in English.
User request, which may be Malay: ${input.prompt.trim() || 'Animate the reference image'}
Required visual style: ${input.style}. ${STYLE_HINTS[input.style] || ''}
Aspect ratio: ${aspectRatio}.
Rules: one paragraph only, no title, no quotes, keep the user's subject, do not invent extra people, describe camera and light, include the visual style, no on-screen text.`

  try {
    const { askGemini } = await import('./gemini-text')
    const text = cleanModelText(await askGemini(instruction, { timeoutMs: 8000 }))
    if (text) return ensureStyle(text, input.style, aspectRatio)
  } catch (error) {
    console.warn('Arahan studio: Gemini tidak digunakan.', error instanceof Error ? error.message : error)
  }

  return fallback
}
