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
Anda ialah pakar penulis skrip iklan TikTok UGC (User Generated Content) Bahasa Melayu yang tular (viral).
Tugas anda adalah memproses maklumat produk dan menghasilkan skrip iklan 4-adegan (scenes) dalam format JSON yang sah.

Maklumat Produk:
- Nama Produk: ${productName}
- Kelebihan / Manfaat: ${productBenefits}
- Sasaran Pelanggan: ${targetAudience || 'Pengguna umum'}

Hasilkan output JSON dalam format berikut SAHAJA (tanpa sebarang teks tambahan atau markdown code block):
{
  "title": "Skrip UGC ${productName}",
  "scenes": [
    {
      "sceneNumber": 1,
      "type": "avatar",
      "title": "Hook (0-3s)",
      "scriptMalay": "Skrip perbualan santai bercakap terus kepada kamera untuk menarik perhatian pembeli.",
      "visualPrompt": "Visual prompt in English for Minimax AI video model. Close-up shot of a friendly Malay woman or man looking directly at camera, speaking expressively holding the product."
    },
    {
      "sceneNumber": 2,
      "type": "b-roll",
      "title": "Masalah / Close-up (3-6s)",
      "scriptMalay": "Skrip menceritakan masalah atau kesukaran sebelum berjumpa produk ini.",
      "visualPrompt": "Visual prompt in English for Minimax AI video model. Aesthetic close-up macro shot showing product details or texture in detail."
    },
    {
      "sceneNumber": 3,
      "type": "b-roll",
      "title": "Penyelesaian (6-9s)",
      "scriptMalay": "Skrip menunjukkan rasa puas hati dan pengalaman menggunakan produk.",
      "visualPrompt": "Visual prompt in English for Minimax AI video model. High quality B-roll shot showing product being opened, unboxed, or used smoothly."
    },
    {
      "sceneNumber": 4,
      "type": "avatar",
      "title": "Call To Action (9-12s)",
      "scriptMalay": "Skrip ajakan mesra untuk membeli atau mencuba sekarang di bag kuning/link.",
      "visualPrompt": "Visual prompt in English for Minimax AI video model. Malay avatar smiling happily holding the product, pointing down invitingly to buy."
    }
  ]
}
`

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt,
    })

    const rawText = response.text ? response.text.trim() : ''
    
    // Bersihkan sintaks markdown JSON jika wujud
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
