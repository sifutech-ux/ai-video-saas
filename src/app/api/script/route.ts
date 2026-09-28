import { NextResponse } from 'next/server'
import { denied, requireStudio } from '@/lib/studio-guard'
import { askGemini, geminiKey, parseStoryboard, publicGeminiError } from '@/lib/gemini-text'

export const maxDuration = 30
export const runtime = 'nodejs'

const scriptPrompt = (productName: string, productBenefits: string, targetAudience: string) => `Anda ialah penulis iklan UGC TikTok Malaysia.
Hasilkan SATU objek JSON sahaja untuk produk ini:
- Nama Produk: ${productName}
- Kelebihan Utama: ${productBenefits}
- Sasaran Pembeli: ${targetAudience || 'Umum'}

Bahasa skrip: Melayu santai, ayat pendek, seperti bercakap pada kamera.
Tepat 4 adegan, jenis mengikut susunan: avatar, b-roll, b-roll, avatar.
visualPrompt dalam bahasa Inggeris, satu ayat, tanpa teks pada skrin.

Bentuk JSON:
{"title":"tajuk","scenes":[{"sceneNumber":1,"type":"avatar","title":"Hook (0-3s)","scriptMalay":"...","visualPrompt":"..."},{"sceneNumber":2,"type":"b-roll","title":"Masalah (3-6s)","scriptMalay":"...","visualPrompt":"..."},{"sceneNumber":3,"type":"b-roll","title":"Penyelesaian (6-9s)","scriptMalay":"...","visualPrompt":"..."},{"sceneNumber":4,"type":"avatar","title":"Call To Action (9-12s)","scriptMalay":"...","visualPrompt":"..."}]}`

export async function POST(req: Request) {
  const session = await requireStudio()
  if (denied(session)) return session

  if (!geminiKey()) {
    return NextResponse.json({ error: publicGeminiError('') }, { status: 503 })
  }

  try {
    const body = await req.json()
    const productName = typeof body.productName === 'string' ? body.productName.trim() : ''
    const productBenefits = typeof body.productBenefits === 'string' ? body.productBenefits.trim() : ''
    const targetAudience = typeof body.targetAudience === 'string' ? body.targetAudience.trim() : ''
    if (!productName || !productBenefits) {
      return NextResponse.json({ error: 'Sila sediakan Nama Produk dan Kelebihan Utama!' }, { status: 400 })
    }

    const text = await askGemini(scriptPrompt(productName, productBenefits, targetAudience), { json: true })
    return NextResponse.json({ success: true, data: parseStoryboard(text) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menjana skrip UGC.'
    console.error('Ralat API Script:', message)
    return NextResponse.json({ error: publicGeminiError(message) }, { status: 500 })
  }
}
