import { NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! })

export async function POST(req: Request) {
  try {
    const { prompt, aspectRatio, imageUrl, type, scriptMalay, gender = 'male' } = await req.json()

    if (!imageUrl && type === 'avatar') {
      return NextResponse.json({ error: 'Sila muat naik Gambar Avatar!' }, { status: 400 })
    }

    let prediction;

    // ADEGAN AVATAR: Enjin Lip-Sync + Suara + Visual Penuh (Tanpa Crop)
    if (type === 'avatar' && imageUrl && scriptMalay) {
      const voiceName = gender === 'female' ? 'ms-MY-YasminNeural' : 'ms-MY-OsmanNeural'
      const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=${voiceName}&text=${encodeURIComponent(scriptMalay)}`

      let base64Audio = ''
      try {
        const audioRes = await fetch(ttsUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        })
        if (!audioRes.ok) throw new Error('TTS Service Busy')
        const audioBuffer = await audioRes.arrayBuffer()
        base64Audio = `data:audio/mp3;base64,${Buffer.from(audioBuffer).toString('base64')}`
      } catch (err) {
        // Fallback Google TTS
        const fallbackUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(scriptMalay)}&tl=ms&client=tw-ob`
        const fallbackRes = await fetch(fallbackUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        const fallbackBuffer = await fallbackRes.arrayBuffer()
        base64Audio = `data:audio/mp3;base64,${Buffer.from(fallbackBuffer).toString('base64')}`
      }

      prediction = await replicate.predictions.create({
        version: "3aa3dac9353cc4d6bd62a8f95957bd844003b401ca4e4a9b33baa574c549d376",
        input: {
          source_image: imageUrl,
          driven_audio: base64Audio,
          enhancer: "gfpgan",
          preprocess: "full", // KUNCI UTAMA: Kekalkan pemotongan gambar penuh (Baju suit & latar belakang)
          still: false,       // Benarkan pergerakan kepala & ekspresi semula jadi semasa bercakap
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
