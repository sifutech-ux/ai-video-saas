export const UGC_DIRECTIONS = [
  {
    id: 'santai',
    label: 'UGC Santai',
    hint: 'Gaya iklan santai. Penyampai bercakap biasa, produk dekat.',
  },
  {
    id: 'live',
    label: 'Live Selling',
    hint: 'Hos di meja, ayat terus, seruan beli. Orang kekal dalam gambar yang dimuat naik.',
  },
  {
    id: 'kecantikan',
    label: 'Demo Kecantikan',
    hint: 'Dekat dan tenang. Klip produk tunjuk tekstur di meja solek.',
  },
  {
    id: 'pelancaran',
    label: 'Pelancaran Produk',
    hint: 'Nada senyap. Produk di atas pelamin, cahaya lembut.',
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
      'Casual Malaysian UGC, the same person in the original photo, same clothes and background, talking naturally to camera. No on-screen text.',
    broll:
      'Casual UGC tabletop, close product shot in natural light, keep the product pack from the reference image. No on-screen text.',
  },
  live: {
    marker: 'bright live-selling table',
    avatar:
      'Live-selling host energy, the same person stays in the original photo, same clothes and background, talking directly to camera. No on-screen text, no comment overlay.',
    broll:
      'Bright live-selling table, ring light, product close on a table, vertical, keep the product pack from the reference image. No on-screen text, no comment overlay.',
  },
  kecantikan: {
    marker: 'soft vanity close-up',
    avatar:
      'Calm beauty demo, the same person stays in the original photo, same clothes and background, gentle close talk to camera. No on-screen text, no skin diagram.',
    broll:
      'Soft vanity close-up, product texture, drop, or smear on a dressing table, keep the product pack from the reference image. No on-screen text, no skin diagram.',
  },
  pelancaran: {
    marker: 'premium product pedestal',
    avatar:
      'Quiet premium launch, the same person stays in the original photo, same clothes and background, slow calm talk to camera. No on-screen text.',
    broll:
      'Premium product pedestal, soft light, pack and logo clear, slow move, keep the product pack from the reference image. No on-screen text.',
  },
}

const BEATS: Record<UgcDirection, string> = {
  santai: `Nada: Melayu santai, seperti kawan bercakap pada kamera.
Adegan 1 avatar: soalan hook pendek.
Adegan 2 b-roll: masalah harian, produk belum jadi hero.
Adegan 3 b-roll: produk menyelesaikan masalah, dekat.
Adegan 4 avatar: ajakan santai.`,
  live: `Nada: hos jualan langsung, ayat sangat pendek dan terus.
Adegan 1 avatar: hook terus kepada penonton.
Adegan 2 b-roll: masalah di atas meja terang.
Adegan 3 b-roll: produk dekat di atas meja, cahaya cincin.
Adegan 4 avatar: seruan beli sekarang.
Jangan tulis komen live atau harga pada skrin.`,
  kecantikan: `Nada: tenang, dekat, seperti demo kecantikan.
Adegan 1 avatar: kebimbangan ringkas, suara lembut.
Adegan 2 b-roll: tekstur, titisan, atau pek di meja solek.
Adegan 3 b-roll: sapuan atau pek terbuka, cahaya lembut.
Adegan 4 avatar: ajakan cuba, tenang.
Jangan buat rajah kulit, label anatomi, atau teks pada skrin.`,
  pelancaran: `Nada: senyap, premium, pelancaran produk baharu.
Adegan 1 avatar: umum sesuatu yang baharu, perlahan.
Adegan 2 b-roll: produk di atas pelamin, cahaya lembut.
Adegan 3 b-roll: butiran pek, logo jelas.
Adegan 4 avatar: ajak tengok produk baharu.`,
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
Tepat 4 adegan, jenis mengikut susunan: avatar, b-roll, b-roll, avatar.
visualPrompt dalam bahasa Inggeris, satu ayat.
Orang dalam adegan avatar kekal dalam gambar asal. Jangan pindahkan mereka ke bilik atau pentas baharu.
Klip produk sahaja yang tunjuk suasana arah ini.

Bentuk JSON:
{"title":"tajuk","scenes":[{"sceneNumber":1,"type":"avatar","title":"Hook (0-3s)","scriptMalay":"...","visualPrompt":"..."},{"sceneNumber":2,"type":"b-roll","title":"Masalah (3-6s)","scriptMalay":"...","visualPrompt":"..."},{"sceneNumber":3,"type":"b-roll","title":"Penyelesaian (6-9s)","scriptMalay":"...","visualPrompt":"..."},{"sceneNumber":4,"type":"avatar","title":"Call To Action (9-12s)","scriptMalay":"...","visualPrompt":"..."}]}`
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
