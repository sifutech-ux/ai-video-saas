import { NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! })

export async function POST(req: Request) {
  try {
    const { prompt, aspectRatio, imageUrl, type } = await req.json()

    if (!imageUrl && type === 'avatar') {
      return NextResponse.json({ error: 'Sila muat naik Gambar Avatar!' }, { status: 400 })
    }

    // Gunakan Minimax untuk kedua-dua Avatar & B-Roll supaya visual natural seperti Video 2
    let finalPrompt = prompt
    if (type === 'avatar' && imageUrl) {
      finalPrompt = `Animate the reference person smiling warmly, subtle head tilt, looking directly at camera, natural expressive face, cinematic lighting, maintaining full body pose.`
    } else if (imageUrl) {
      finalPrompt = `${prompt}, subtle natural movement, continuous shot, high quality, photorealistic, preserve original image details.`
    }

    const prediction = await replicate.predictions.create({
      model: "minimax/video-01",
      input: {
        prompt: finalPrompt,
        aspect_ratio: aspectRatio || '9:16',
        prompt_optimizer: false,
        first_frame_image: imageUrl || undefined,
      },
    })

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
