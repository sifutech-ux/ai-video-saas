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
