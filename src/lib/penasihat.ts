export const PENASIHAT_STAGES = ['mula', 'jual', 'kembang'] as const

export type PenasihatStage = (typeof PENASIHAT_STAGES)[number]

export type PenasihatTurn = {
  dari: 'klien' | 'penasihat'
  teks: string
}

export type PenasihatReply = {
  jawapan: string
  langkah: [string, string, string]
}

export const PENASIHAT_ORIGINS = [
  'https://beshareaisolution.com',
  'https://www.beshareaisolution.com',
  'http://127.0.0.1:8000',
  'http://localhost:8000',
]

const STAGE_LABEL: Record<PenasihatStage, string> = {
  mula: 'Baru nak mula',
  jual: 'Sudah jual',
  kembang: 'Nak kembangkan',
}

export function originAllowed(origin: string | null) {
  return !!origin && PENASIHAT_ORIGINS.includes(origin)
}

export function penasihatStage(value: unknown): PenasihatStage | null {
  return value === 'mula' || value === 'jual' || value === 'kembang' ? value : null
}

export function clipTurns(value: unknown): PenasihatTurn[] {
  if (!Array.isArray(value)) return []
  const turns: PenasihatTurn[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const dari = (item as { dari?: unknown }).dari
    const teks = (item as { teks?: unknown }).teks
    if ((dari !== 'klien' && dari !== 'penasihat') || typeof teks !== 'string') continue
    const clean = teks.replace(/\s+/g, ' ').trim().slice(0, 600)
    if (!clean) continue
    turns.push({ dari, teks: clean })
  }
  return turns.slice(-8)
}

export function needsQualifiedReferral(text: string) {
  return /cukai|sst|undang-undang|ssm|guaman|lesen|e-invois|lhdn/i.test(text)
}

function plain(text: string) {
  return text.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}

export function penasihatPrompt(input: {
  nama: string
  jualan: string
  peringkat: PenasihatStage
  giliran: PenasihatTurn[]
}) {
  const history = input.giliran
    .map((turn) => `${turn.dari === 'klien' ? 'Klien' : 'Penasihat'}: ${turn.teks}`)
    .join('\n')
  return `Awak penasihat perniagaan untuk peniaga kecil di Malaysia.
Bahasa: Bahasa Malaysia seperti percakapan di Malaysia, bukan loghat atau perkataan Indonesia. Jangan campur frasa Inggeris.
Panggil klien "awak". Jangan anggap jantina.
Jangan reka harga, diskaun, hasil jualan, atau fakta undang-undang.
Jika klien sentuh cukai, undang-undang, atau SSM, beritahu mereka rujuk orang yang berkelayakan. Jangan bagi keputusan muktamad.
Perniagaan: ${input.nama}
Yang dijual dan kepada siapa: ${input.jualan}
Peringkat: ${STAGE_LABEL[input.peringkat]}

Perbualan:
${history || 'Klien baru membuka perbualan.'}

Balas mesej terakhir klien.
Pulangkan SATU objek JSON sahaja:
{"jawapan":"ayat pendek dalam Bahasa Malaysia","langkah":["langkah 1","langkah 2","langkah 3"]}
jawapan paling banyak 80 patah perkataan dan tidak mengulang senarai langkah.
langkah tepat 3 item. Setiap item satu ayat yang boleh dibuat pada minggu ini.`
}

export function parsePenasihatReply(text: string): PenasihatReply {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Jawapan penasihat tidak lengkap.')
  const data = JSON.parse(text.slice(start, end + 1)) as { jawapan?: unknown; langkah?: unknown }
  const jawapan = typeof data.jawapan === 'string' ? plain(data.jawapan) : ''
  const langkah = Array.isArray(data.langkah)
    ? data.langkah.filter((item): item is string => typeof item === 'string').map(plain).filter(Boolean).slice(0, 3)
    : []
  if (!jawapan || langkah.length < 3) throw new Error('Langkah minggu ini tidak lengkap.')
  return { jawapan, langkah: [langkah[0], langkah[1], langkah[2]] }
}

export function localPenasihat(input: {
  nama: string
  jualan: string
  peringkat: PenasihatStage
  giliran: PenasihatTurn[]
}): PenasihatReply {
  const soalan = [...input.giliran].reverse().find((turn) => turn.dari === 'klien')?.teks ?? ''
  const rujuk = needsQualifiedReferral(soalan)
    ? ' Perkara cukai, undang-undang, dan SSM perlu dirujuk kepada orang yang berkelayakan.'
    : ''
  const jual = /[.!?]$/.test(input.jualan) ? input.jualan : `${input.jualan}.`
  if (input.peringkat === 'mula') {
    return {
      jawapan: `${input.nama} baru nak bermula. ${jual}${rujuk} Minggu ini, pastikan seorang pelanggan faham tawaran ini dalam satu ayat.`,
      langkah: [
        `Tulis satu ayat tawaran ${input.nama}: apa yang dijual dan kepada siapa.`,
        'Senaraikan sepuluh orang yang mungkin beli, kemudian mesej tiga orang hari ini.',
        'Tetapkan satu cara pelanggan bertanya dan satu cara mereka bayar.',
      ],
    }
  }
  if (input.peringkat === 'jual') {
    return {
      jawapan: `${input.nama} sudah ada jualan. ${jual}${rujuk} Minggu ini, ulang apa yang sudah mendatangkan pembeli.`,
      langkah: [
        `Tulis tiga sebab pelanggan terakhir beli ${input.nama}.`,
        'Hubungi lima pelanggan lama dan tanya apa yang mereka mahu seterusnya.',
        'Pilih satu tawaran untuk minggu ini dan sebarkan pada saluran yang sudah ada pembeli.',
      ],
    }
  }
  return {
    jawapan: `${input.nama} nak dikembangkan. ${jual}${rujuk} Minggu ini, dalamkan satu saluran yang sudah berjalan.`,
    langkah: [
      'Pilih satu saluran jualan yang sudah ada pembeli, dan luangkan masa tetap di situ setiap hari.',
      'Catat berapa pertanyaan masuk dan berapa yang jadi belian.',
      `Tulis satu penambahbaikan pada tawaran ${input.nama} berdasarkan aduan yang berulang.`,
    ],
  }
}

const notes = new Map<string, { n: number; at: number }>()

export function tooManyNotes(key: string, now = Date.now()) {
  const row = notes.get(key)
  if (!row || now - row.at > 60_000) {
    notes.set(key, { n: 1, at: now })
    return false
  }
  row.n += 1
  return row.n > 12
}
