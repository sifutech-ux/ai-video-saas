import { NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! })

// Enjin Suara Lelaki Osman Neural (Microsoft Bing ReadAloud SSML)
async function getMaleOsmanAudioBase64(text: string): Promise<string> {
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ms-MY'><voice name='ms-MY-OsmanNeural'><prosody pitch='+0Hz' rate='+0%'>${text}</prosody></voice></speak>`
  
  const res = await fetch('https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/single/actual?api-version=2024-03-01-preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/ssml+xml',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'TrustedClientToken': '6A5AA1D4EA5E40C081684B00F576E769',
    },
    body: ssml,
  })

  if (!res.ok) {
    throw new Error(`Gagal menjana suara Osman Neural (Status: ${res.status})`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return `data:audio/mp3;base64,${Buffer.from(arrayBuffer).toString('base64')}`
}

export async function POST(req: Request) {
  try {
    const { prompt, aspectRatio, imageUrl, type, scriptMalay } = await req.json()

    if (!imageUrl && type === 'avatar') {
      return NextResponse.json({ error: 'Sila muat naik Gambar Avatar!' }, { status: 400 })
    }

    let prediction;

    if (type === 'avatar' && imageUrl && scriptMalay) {
      // Dapatkan Audio Suara Lelaki Osman Neural sebenar
      const base64Audio = await getMaleOsmanAudioBase64(scriptMalay)

      prediction = await replicate.predictions.create({
        version: "3aa3dac9353cc4d6bd62a8f95957bd844003b401ca4e4a9b33baa574c549d376",
        input: {
          source_image: imageUrl,
          driven_audio: base64Audio,
          enhancer: "gfpgan",
          preprocess: "full", // Kekalkan saiz badan & latar belakang penuh
          still: false,
        }
      })
    } else {
      // ADEGAN PRODUK (B-ROLL)
      let finalPrompt = prompt
      if (imageUrl) {
        finalPrompt = `${prompt}, subtle natural movement, continuous shot, high quality, photorealistic, preserve original image details.`
      }

      prediction = await replicate.predictions.create({
        model: "minimax/video-01",
        input: {
          prompt: finalPrompt,
          aspect_ratio: aspectRatio || '9:16',
          prompt_optimizer: false,
          first_frame_image: imageUrl || undefined,
        },
      })
    }

    return NextResponse.json({
      success: true,
      jobId: prediction.id,
      status: prediction.status,
    })

  } catch (error: any) {
    console.error('Ralat API Generate:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
