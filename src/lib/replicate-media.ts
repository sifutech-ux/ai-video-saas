export function decodeDataUrl(value: string) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(value.trim())
  if (!match) return null
  const mime = match[1].toLowerCase()
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
  if (bytes.length < 32) return null
  return { mime, bytes, name: nameForMime(mime) }
}

function nameForMime(mime: string) {
  if (mime.includes('png')) return 'gambar.png'
  if (mime.includes('webp')) return 'gambar.webp'
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'suara.mp3'
  if (mime.includes('wav')) return 'suara.wav'
  if (mime.startsWith('image/')) return 'gambar.jpg'
  if (mime.startsWith('audio/')) return 'suara.wav'
  return 'fail.bin'
}

export function videoErrorText(error: unknown) {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error)
    } catch {
      return ''
    }
  }
  return ''
}

export function providerBusy(error: unknown) {
  const text = videoErrorText(error)
  return /E004|temporarily unavailable|50501|Upload file failed|EulerError|Internal RPC|algo_code|gateway_code/i.test(text)
}

export function publicVideoError(error: unknown) {
  const text = videoErrorText(error).replace(/\s+/g, ' ').trim()
  if (!text) return 'Penjanaan video gagal di pelayan AI.'
  if (providerBusy(error)) return 'Pelayan video sedang sibuk. Sila jana adegan ini sekali lagi.'
  if (/35 second/i.test(text)) return 'Audio terlalu panjang. Pendekkan skrip, kemudian jana semula.'
  if (/Unauthenticated|authentication token/i.test(text)) return 'Pelayan video belum disambungkan.'
  return text.length > 180 ? `${text.slice(0, 180)}…` : text
}

type FileHost = {
  files: {
    create: (file: File) => Promise<{ urls?: { get?: string } }>
  }
}

export async function hostedAssetUrl(host: FileHost, value: string) {
  if (!value.startsWith('data:')) return value
  const decoded = decodeDataUrl(value)
  if (!decoded) throw new Error('Fail media tidak sah.')
  const file = new File([new Uint8Array(decoded.bytes)], decoded.name, { type: decoded.mime })
  const uploaded = await host.files.create(file)
  const url = uploaded?.urls?.get
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    throw new Error('Fail media tidak dapat dihantar ke pelayan video.')
  }
  return url
}
