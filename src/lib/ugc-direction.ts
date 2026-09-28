export const UGC_DIRECTIONS = [
  {
    id: 'santai',
    label: 'UGC Santai',
    hint: 'Penyampai dan produk dalam suasana santai.',
  },
  {
    id: 'live',
    label: 'Live Selling',
    hint: 'Penyampai dan produk di meja jualan yang terang.',
  },
  {
    id: 'kecantikan',
    label: 'Demo Kecantikan',
    hint: 'Penyampai dan produk di meja solek.',
  },
  {
    id: 'pelancaran',
    label: 'Pelancaran Produk',
    hint: 'Penyampai dan produk di atas pelamin, cahaya lembut.',
  },
] as const

export type UgcDirection = (typeof UGC_DIRECTIONS)[number]['id']

export function ugcDirection(value: unknown): UgcDirection {
  if (value === 'live' || value === 'kecantikan' || value === 'pelancaran') return value
  return 'santai'
}

export function directionLabel(direction: UgcDirection) {
  return UGC_DIRECTIONS.find((item) => item.id === direction)?.label ?? 'UGC Santai'
}

const LOOK: Record<UgcDirection, { avatar: string; broll: string; marker: string }> = {
  santai: {
    marker: 'casual UGC tabletop',
    avatar:
      'Same face, casual UGC tabletop in a simple bright room, waist-up, talking to camera. No on-screen text.',
    broll:
      'Casual UGC tabletop, close product shot in natural light, keep the product pack from the reference image. No on-screen text.',
  },
  live: {
    marker: 'bright live-selling table',
    avatar:
      'Same face at a bright live-selling table with a ring light, waist-up, talking to camera. No on-screen text, no comment overlay.',
    broll:
      'Bright live-selling table, ring light, product close on a table, vertical, keep the product pack from the reference image. No on-screen text, no comment overlay.',
  },
  kecantikan: {
    marker: 'soft vanity close-up',
    avatar:
      'Same face, soft vanity close-up, gentle talk to camera. No on-screen text, no skin diagram.',
    broll:
      'Soft vanity close-up, product texture, drop, or smear on a dressing table, keep the product pack from the reference image. No on-screen text, no skin diagram.',
  },
  pelancaran: {
    marker: 'premium product pedestal',
    avatar:
      'Same face in a quiet premium product pedestal set, soft light, slow talk to camera. No on-screen text.',
    broll:
      'Premium product pedestal, soft light, pack and logo clear, slow move, keep the product pack from the reference image. No on-screen text.',
  },
}

const BEATS: Record<UgcDirection, string> = {
  santai: `Nada: Melayu santai, seperti kawan bercakap pada kamera.
Adegan 1 avatar: penyampai bercakap dalam suasana santai, satu ayat.
Adegan 2 b-roll: produk yang sama dalam suasana santai itu, satu ayat.`,
  live: `Nada: hos jualan langsung, ayat sangat pendek dan terus.
Adegan 1 avatar: penyampai di meja jualan terang, seruan beli sekarang.
Adegan 2 b-roll: produk yang sama di meja jualan terang itu.
Jangan tulis komen live atau harga pada skrin.`,
  kecantikan: `Nada: tenang, dekat, seperti demo kecantikan.
Adegan 1 avatar: penyampai di meja solek, suara lembut.
Adegan 2 b-roll: produk yang sama di meja solek itu.
Jangan buat rajah kulit, label anatomi, atau teks pada skrin.`,
  pelancaran: `Nada: senyap, premium, pelancaran produk baharu.
Adegan 1 avatar: penyampai di sebelah pelamin, perlahan.
Adegan 2 b-roll: produk di atas pelamin, cahaya lembut.`,
}

export function placePrompt(direction: UgcDirection, kind: 'orang' | 'produk') {
  const place = {
    santai: {
      orang:
        'Place this same person in a simple bright room, casual UGC tabletop behind them, waist-up, looking at the camera. Keep the face identical. Vertical 9:16. No text.',
      produk:
        'Place this exact product pack on a simple table in soft daylight, casual UGC tabletop. Keep the pack and logo identical. Vertical 9:16. No text.',
    },
    live: {
      orang:
        'Place this same person at a bright live-selling table with a ring light, waist-up, looking at the camera. Keep the face identical. Vertical 9:16. No text, no comments, no prices.',
      produk:
        'Place this exact product pack on a bright live-selling table under a ring light, close. Keep the pack and logo identical. Vertical 9:16. No text, no comments.',
    },
    kecantikan: {
      orang:
        'Place this same person at a soft vanity close-up, gentle, looking at the camera. Keep the face identical. Vertical 9:16. No text, no skin diagram.',
      produk:
        'Place this exact product pack on a soft vanity close-up, texture visible. Keep the pack and logo identical. Vertical 9:16. No text, no skin diagram.',
    },
    pelancaran: {
      orang:
        'Place this same person beside a premium product pedestal, soft light, waist-up, looking at the camera. Keep the face identical. Vertical 9:16. No text.',
      produk:
        'Place this exact product pack on a premium product pedestal, soft light, pack and logo clear. Keep the pack identical. Vertical 9:16. No text.',
    },
  } satisfies Record<UgcDirection, { orang: string; produk: string }>
  return place[direction][kind]
}

export function withDirectionLook(prompt: string, direction: UgcDirection, type: 'avatar' | 'b-roll') {
  const look = LOOK[direction]
  const sentence = type === 'b-roll' ? look.broll : look.avatar
  const clean = prompt.replace(/\s+/g, ' ').trim()
  if (clean.toLowerCase().includes(look.marker.toLowerCase())) return clean
  return clean ? `${clean} ${sentence}` : sentence
}

export function scriptPrompt(input: {
  productName: string
  productBenefits: string
  targetAudience: string
  direction: UgcDirection
}) {
  return `Anda ialah penulis iklan TikTok Malaysia.
Hasilkan SATU objek JSON sahaja untuk produk ini:
- Nama Produk: ${input.productName}
- Kelebihan Utama: ${input.productBenefits}
- Sasaran Pembeli: ${input.targetAudience || 'Umum'}
- Arah: ${directionLabel(input.direction)}

${BEATS[input.direction]}

Bahasa skrip: Melayu, ayat pendek, seperti bercakap pada kamera.
Tepat 2 adegan sahaja: avatar, kemudian b-roll.
visualPrompt dalam bahasa Inggeris, satu ayat.
Penyampai dan produk berada dalam scene yang sama. Kekalkan muka orang dan rupa pek produk.

Bentuk JSON:
{"title":"tajuk","scenes":[{"sceneNumber":1,"type":"avatar","title":"Penyampai","scriptMalay":"...","visualPrompt":"..."},{"sceneNumber":2,"type":"b-roll","title":"Produk","scriptMalay":"...","visualPrompt":"..."}]}`
}

export function oneAd<T extends { scenes?: Array<{ type?: string; title?: string; sceneNumber?: number }> }>(board: T): T {
  const scenes = Array.isArray(board.scenes) ? board.scenes : []
  const avatar = scenes.find((scene) => scene.type === 'avatar') ?? scenes[0]
  const product = scenes.find((scene) => scene.type === 'b-roll') ?? scenes.find((scene) => scene !== avatar)
  if (!avatar || !product) return board
  return {
    ...board,
    scenes: [
      { ...avatar, sceneNumber: 1, type: 'avatar', title: 'Penyampai' },
      { ...product, sceneNumber: 2, type: 'b-roll', title: 'Produk' },
    ],
  }
}

export function dressStoryboard<T extends { scenes?: Array<{ type?: string; visualPrompt?: string }> }>(
  board: T,
  direction: UgcDirection
): T {
  const scenes = Array.isArray(board.scenes) ? board.scenes : []
  return {
    ...board,
    scenes: scenes.map((scene) => ({
      ...scene,
      visualPrompt: withDirectionLook(
        typeof scene.visualPrompt === 'string' ? scene.visualPrompt : '',
        direction,
        scene.type === 'b-roll' ? 'b-roll' : 'avatar'
      ),
    })),
  }
}
