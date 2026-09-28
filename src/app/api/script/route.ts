import { NextResponse } from 'next/server'
import { denied, requireStudio } from '@/lib/studio-guard'
import { askGemini, geminiKey, parseStoryboard, publicGeminiError } from '@/lib/gemini-text'
import { dressStoryboard, localAd, oneAd, scriptPrompt, ugcDirection } from '@/lib/ugc-direction'

export const maxDuration = 60
export const runtime = 'nodejs'

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
    const direction = ugcDirection(body.direction)
    if (!productName || !productBenefits) {
      return NextResponse.json({ error: 'Sila sediakan Nama Produk dan Kelebihan Utama!' }, { status: 400 })
    }

    let board
    try {
      const text = await askGemini(scriptPrompt({ productName, productBenefits, targetAudience, direction }), { json: true })
      board = dressStoryboard(oneAd(parseStoryboard(text)), direction)
    } catch (error) {
      console.warn('Skrip sandaran digunakan.', error instanceof Error ? error.message : error)
      board = dressStoryboard(localAd({ productName, productBenefits, direction }), direction)
    }
    return NextResponse.json({ success: true, data: board, direction })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menjana skrip UGC.'
    console.error('Ralat API Script:', message)
    return NextResponse.json({ error: publicGeminiError(message) }, { status: 500 })
  }
}
