import { NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! })

export async function POST(req: Request) {
  try {
    const { prompt, aspectRatio, imageUrl, type, scriptMalay, customAudio } = await req.json()

    if (!imageUrl && type === 'avatar') {
      return NextResponse.json({ error: 'Sila muat naik Gambar Avatar!' }, { status: 400 })
    }

    let prediction;

    if (type === 'avatar' && imageUrl) {
      let finalAudio = customAudio

      // Fallback ke Google TTS jika tiada audio sendiri dimuat naik
      if (!finalAudio && scriptMalay) {
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(scriptMalay)}&tl=ms&client=tw-ob`
        const audioRes = await fetch(ttsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        
        if (!audioRes.ok) throw new Error('Gagal memuat turun audio TTS')
        
        const audioBuffer = await audioRes.arrayBuffer()
        finalAudio = `data:audio/mp3;base64,${Buffer.from(audioBuffer).toString('base64')}`
      }

      if (!finalAudio) {
        return NextResponse.json({ error: 'Sila muat naik fail audio suara atau sediakan skrip!' }, { status: 400 })
      }

      // Penjanaan Enjin LivePortrait (Visual Penuh Tanpa Crop + Lip-Sync)
      prediction = await replicate.predictions.create({
        model: "lucataco/live-portrait",
        input: {
          face_image: imageUrl,
          driving_audio: finalAudio,
        }
      })
    } else {
      // ADEGAN PRODUK (B-ROLL MINIMAX)
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
