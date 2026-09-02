import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function POST(req: Request) {
  try {
    const { productName, productBenefits, targetAudience } = await req.json()

    if (!productName || !productBenefits) {
      return NextResponse.json(
        { error: 'Sila sediakan Nama Produk dan Kelebihan Utama!' },
        { status: 400 }
      )
    }

    const prompt = `Anda ialah pakar penulisan skrip iklan UGC TikTok Bahasa Melayu yang berpengalaman.
Tugas anda adalah menghasilkan skrip & papan cerita (storyboard) 4-adegan untuk produk berikut:

- Nama Produk: ${productName}
- Kelebihan Utama: ${productBenefits}
- Sasaran Pembeli: ${targetAudience || 'Umum'}

Gaya Penulisan:
- Gunakan Bahasa Melayu santai, mesra, percakapan harian (seperti percakapan UGC TikTok Malaysia).
- Jangan guna bahasa buku yang kaku.

Format Output (WAJIB dalam format JSON SAHAJA, tanpa sebarang teks tambahan):
{
  "title": "Tajuk Iklan UGC",
  "scenes": [
    {
      "sceneNumber": 1,
      "type": "avatar",
      "title": "Hook (0-3s)",
      "scriptMalay": "Ayat percakapan di sini...",
      "visualPrompt": "Subtle motion, reference person looking at camera with an engaging expression, smooth natural head tilt, soft studio lighting"
    },
    {
      "sceneNumber": 2,
      "type": "b-roll",
      "title": "Masalah / Close-up (3-6s)",
      "scriptMalay": "Ayat percakapan di sini...",
      "visualPrompt": "Slow cinematic zoom in on the product, soft ambient lighting, high detail, sharp focus"
    },
    {
      "sceneNumber": 3,
      "type": "b-roll",
      "title": "Penyelesaian (6-9s)",
      "scriptMalay": "Ayat percakapan di sini...",
      "visualPrompt": "Slow camera pan across the prepared product, bright commercial studio lighting, crisp details"
    },
    {
      "sceneNumber": 4,
      "type": "avatar",
      "title": "Call To Action (9-12s)",
      "scriptMalay": "Ayat percakapan di sini...",
      "visualPrompt": "Reference person smiling warmly at camera, slight head movement, welcoming atmosphere"
    }
  ]
}`

    // Senarai model stabil untuk dicuba berturut-turut jika berlaku 503 / 429
    const candidateModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash']
    let responseText = ''
    let lastError: any = null

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeAIModel({ model: modelName })
        const result = await model.generateContent(prompt)
        responseText = result.response.text()
        if (responseText) break
      } catch (err: any) {
        console.warn(`Model ${modelName} sibuk/ralat, mencuba model seterusnya...`, err)
        lastError = err
        await sleep(1500)
      }
    }

    if (!responseText) {
      throw new Error(
        'Pelayan Google Gemini sedang sibuk. Sila tunggu 10-15 saat dan tekan butang sekali lagi.'
      )
    }

    const cleanJson = responseText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()

    const parsedData = JSON.parse(cleanJson)

    return NextResponse.json({ success: true, data: parsedData })
  } catch (error: any) {
    console.error('Ralat API Script:', error)
    return NextResponse.json(
      { error: error.message || 'Gagal menjana skrip UGC.' },
      { status: 500 }
    )
  }
}
