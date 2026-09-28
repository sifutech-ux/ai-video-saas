export function allowedMediaUrl(raw: string) {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return host === 'replicate.com' || host === 'replicate.delivery' || host.endsWith('.replicate.com') || host.endsWith('.replicate.delivery')
  } catch {
    return false
  }
}

export function firstOutputUrl(output: unknown) {
  const value = Array.isArray(output) ? output[0] : output
  return typeof value === 'string' ? value : ''
}

export async function fetchAllowedMedia(raw: string) {
  if (!allowedMediaUrl(raw)) throw new Error('Pautan klip tidak dikenali.')
  let current = raw
  for (let hop = 0; hop < 3; hop += 1) {
    const response = await fetch(current, { redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
      const next = new URL(response.headers.get('location') || '', current).toString()
      if (!allowedMediaUrl(next)) throw new Error('Pautan klip tidak dikenali.')
      current = next
      continue
    }
    if (!response.ok) throw new Error('Klip tidak dapat dimuat turun.')
    return Buffer.from(await response.arrayBuffer())
  }
  throw new Error('Pautan klip tidak dikenali.')
}
