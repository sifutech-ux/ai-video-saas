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
Anda ialah pakar penulis skrip iklan TikTok UGC (User Generated Content) Bahasa Melayu yang tular.
Tugas anda adalah memproses maklumat produk dan menghasilkan skrip iklan 4-adegan dalam format JSON.
Prompt visual (visualPrompt) MESTI direka khas untuk teknik Image-to-Video (I2V) bagi menggerakkan gambar rujukan secara semula jadi (cth: pergerakan kepala perlahan, kenyip mata, senyuman, pergerakan kamera rapat).

Maklumat Produk:
- Nama Produk: ${productName}
- Kelebihan / Manfaat: ${productBenefits}
- Sasaran Pelanggan: ${targetAudience || 'Pengguna umum'}

Hasilkan output JSON dalam format berikut SAHAJA (tanpa sebarang markdown code block):
{
  "title": "Skrip UGC ${productName}",
  "scenes": [
    {
      "sceneNumber": 1,
      "type": "avatar",
      "title": "Hook (0-3s)",
      "scriptMalay": "Skrip perbualan santai bercakap terus kepada kamera untuk menarik perhatian pembeli.",
      "visualPrompt": "Animate the reference person speaking expressively to camera, realistic head movement, natural eye blink, smiling happily, holding ${productName} in hand."
    },
    {
      "sceneNumber": 2,
      "type": "b-roll",
      "title": "Masalah / Close-up (3-6s)",
      "scriptMalay": "Skrip menceritakan masalah atau kesukaran sebelum berjumpa produk ini.",
      "visualPrompt": "Close-up macro shot animating the reference product package with subtle cinematic slow zoom, soft lighting, showing premium details."
    },
    {
      "sceneNumber": 3,
      "type": "b-roll",
      "title": "Penyelesaian (6-9s)",
      "scriptMalay": "Skrip menunjukkan rasa puas hati dan pengalaman menggunakan produk.",
      "visualPrompt": "Cinematic B-roll shot animating product being unboxed or handled smoothly with subtle hand motion and natural lighting."
    },
    {
      "sceneNumber": 4,
      "type": "avatar",
      "title": "Call To Action (9-12s)",
      "scriptMalay": "Skrip ajakan mesra untuk membeli sekarang di bag kuning/link.",
      "visualPrompt": "Animate the reference person smiling warmly, pointing down towards screen invitingly, enthusiastic facial expression."
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
