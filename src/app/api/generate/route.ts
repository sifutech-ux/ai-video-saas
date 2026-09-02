import { NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! })

export async function POST(req: Request) {
  try {
    const { prompt, aspectRatio, imageUrl, type, scriptMalay } = await req.json()

    // Semakan wajib gambar untuk adegan muka
    if (!imageUrl && type === 'avatar') {
      return NextResponse.json({ error: 'Sila muat naik Gambar Avatar/Model untuk adegan bercakap!' }, { status: 400 })
    }

    let prediction;

    // JIKA ADEGAN AVATAR: Guna Enjin Khas Lip-Sync (SadTalker)
    if (type === 'avatar' && imageUrl && scriptMalay) {
      
      // 1. Dapatkan Audio TTS Bahasa Melayu (Suara Lelaki: OsmanNeural)
      const voice = 'ms-MY-OsmanNeural' 
      const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(scriptMalay)}`
      
      const audioRes = await fetch(ttsUrl)
      const audioBuffer = await audioRes.arrayBuffer()
      const base64Audio = `data:audio/mp3;base64,${Buffer.from(audioBuffer).toString('base64')}`

      // 2. Hantar Gambar Muka & Audio ke Enjin Lip-Sync Replicate
      prediction = await replicate.predictions.create({
        version: "3aa3dac9353cc4d6bd62a8f95957bd844003b401ca4e4a9b33baa574c549d376", // Model Lip-Sync
        input: {
          source_image: imageUrl,
          driven_audio: base64Audio,
          enhancer: "gfpgan", // Menajamkan kualiti muka & mata
          still: true, // Kunci bentuk dahi/leher supaya tak herot
        }
      })
      
    } else {
      // JIKA ADEGAN PRODUK (B-ROLL): Guna Enjin Minimax
      let finalPrompt = prompt
      if (imageUrl) {
        finalPrompt = `${prompt}, subtle natural movement, continuous shot, high quality, photorealistic, preserve original image details.`
      }

      const inputPayload: Record<string, any> = {
        prompt: finalPrompt,
        aspect_ratio: aspectRatio || '9:16',
        prompt_optimizer: false, // Elak AI reka tulisan cakar ayam
      }

      if (imageUrl) inputPayload.first_frame_image = imageUrl

      prediction = await replicate.predictions.create({
        model: "minimax/video-01",
        input: inputPayload,
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
