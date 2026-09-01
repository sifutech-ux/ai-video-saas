import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

export async function POST(req: Request) {
  try {
    const { productName, productBenefits, targetAudience } = await req.json()

    if (!productName || !productBenefits) {
      return NextResponse.json(
        { error: 'Sila masukkan nama produk dan kelebihan utama!' },
        { status: 400 }
      )
    }

    const systemPrompt = `
Anda ialah pakar penulis skrip iklan TikTok UGC Bahasa Melayu.
Tugas anda adalah memproses maklumat produk dan menghasilkan skrip iklan 4-adegan dalam format JSON.

PENTING UNTUK VISUAL PROMPT:
Kerana kita menggunakan Image-to-Video, prompt visual MESTI RINGKAS dan HANYA fokus pada pergerakan halus (subtle motion) atau pergerakan kamera. JANGAN minta AI bina objek baharu, megenggang barang baharu, atau lukis semula muka/teks.

Format JSON SAHAJA (tanpa markdown code block):
{
  "title": "Skrip UGC ${productName}",
  "scenes": [
    {
      "sceneNumber": 1,
      "type": "avatar",
      "title": "Hook (0-3s)",
      "scriptMalay": "Skrip perbualan santai bercakap terus kepada kamera untuk menarik perhatian pembeli.",
      "visualPrompt": "Subtle motion, reference person looking at camera with a natural friendly expression, smooth head tilt, cinematic lighting"
    },
    {
      "sceneNumber": 2,
      "type": "b-roll",
      "title": "Masalah / Close-up (3-6s)",
      "scriptMalay": "Skrip menceritakan masalah atau kesukaran sebelum berjumpa produk ini.",
      "visualPrompt": "Slow cinematic zoom in on the product, soft ambient lighting, high detail, clear focus"
    },
    {
      "sceneNumber": 3,
      "type": "b-roll",
      "title": "Penyelesaian (6-9s)",
      "scriptMalay": "Skrip menunjukkan rasa puas hati dan pengalaman menggunakan produk.",
      "visualPrompt": "Slow camera pan across the product, bright commercial studio lighting, crisp details"
    },
    {
      "sceneNumber": 4,
      "type": "avatar",
      "title": "Call To Action (9-12s)",
      "scriptMalay": "Skrip ajakan mesra untuk membeli sekarang di bag kuning/link.",
      "visualPrompt": "Reference person smiling warmly at camera, slight head movement, welcoming atmosphere"
    }
  ]
}
`

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: systemPrompt,
    })

    const rawText = response.text ? response.text.trim() : ''
    
    const cleanedJson = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')

    const parsedData = JSON.parse(cleanedJson)

    return NextResponse.json({
      success: true,
      data: parsedData,
    })
  } catch (error: any) {
    console.error('Ralat API Skrip UGC:', error)
    return NextResponse.json(
      { error: 'Gagal menjana skrip UGC: ' + error.message },
      { status: 500 }
    )
  }
}
