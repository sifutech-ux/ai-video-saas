import { NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! })

export async function POST(req: Request) {
  try {
    const { prompt, aspectRatio, imageUrl, type, scriptMalay } = await req.json()

    if (!imageUrl && type === 'avatar') {
      return NextResponse.json({ error: 'Sila muat naik Gambar Avatar!' }, { status: 400 })
    }

    let prediction;

    // ADEGAN AVATAR: Hantar URL HTTP Awam Terus ke Replicate
    if (type === 'avatar' && imageUrl && scriptMalay) {
      const voice = 'ms-MY-OsmanNeural'
      const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(scriptMalay)}`

      prediction = await replicate.predictions.create({
        version: "3aa3dac9353cc4d6bd62a8f95957bd844003b401ca4e4a9b33baa574c549d376",
        input: {
          source_image: imageUrl,
          driven_audio: ttsUrl, // Pautan HTTP terus (Elak Ralat Video Bisu)
          enhancer: "gfpgan",
          preprocess: "full",   // Kekalkan bentuk muka penuh
          still: false,
        }
      })
    } else {
      // ADEGAN PRODUK (B-ROLL): Guna Minimax
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
