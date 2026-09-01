import { NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! })

export async function POST(req: Request) {
  try {
    const { prompt, aspectRatio, imageUrl, style } = await req.json()

    if (!prompt && !imageUrl) {
      return NextResponse.json({ error: 'Sila masukkan prompt teks atau muat naik gambar!' }, { status: 400 })
    }

    // Jika gambar rujukan disediakan, gunakan prompt ringkas & fokus pada pergerakan kamera
    // Elakkan perkataan yang menyuruh AI melukis objek baharu
    let finalPrompt = prompt
    if (imageUrl) {
      finalPrompt = `${prompt}, subtle natural movement, continuous shot, high quality, photorealistic, no text distortion, preserve original image details.`
    }

    const inputPayload: Record<string, any> = {
      prompt: finalPrompt,
      aspect_ratio: aspectRatio || '9:16',
      prompt_optimizer: false, // Matikan optimiser Replicate supaya imej asal tidak direka semula
    }

    if (imageUrl) {
      inputPayload.first_frame_image = imageUrl
    }

    const prediction = await replicate.predictions.create({
      model: "minimax/video-01",
      input: inputPayload,
    })

    return NextResponse.json({
      success: true,
      jobId: prediction.id,
      enhancedPrompt: finalPrompt,
      status: prediction.status,
    })

  } catch (error: any) {
    console.error('Ralat API Generate:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
