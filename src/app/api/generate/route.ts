import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import Replicate from 'replicate'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! })

export async function POST(req: Request) {
  try {
    const { prompt, aspectRatio, imageUrl, enableAudio, style } = await req.json()

    if (!prompt && !imageUrl) {
      return NextResponse.json({ error: 'Sila masukkan prompt teks atau muat naik gambar!' }, { status: 400 })
    }

    let enhancedPrompt = prompt || 'Animate this image smoothly with realistic motion, natural head movement, and eye blinking'

    try {
      const audioInstruction = enableAudio
        ? ' Include immersive realistic motion suited for video advertising.'
        : ''

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: `Enhance this prompt for AI image animation / video generation with style "${style || 'Photorealistic'}". Ensure realistic facial motions, smooth movements, high detail, no distortion, no morphing.${audioInstruction} User prompt: "${enhancedPrompt}"`,
      })

      if (response.text) {
        enhancedPrompt = response.text.trim()
      }
    } catch (geminiError) {
      console.warn('Optimasi Gemini dilepaskan, menggunakan prompt asal:', geminiError)
    }

    const inputPayload: Record<string, any> = {
      prompt: enhancedPrompt,
      aspect_ratio: aspectRatio || '9:16',
      prompt_optimizer: true,
    }

    // Jika gambar rujukan disediakan, masukkan ke first_frame_image
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
      enhancedPrompt: enhancedPrompt,
      status: prediction.status,
    })

  } catch (error: any) {
    console.error('Ralat API Generate:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
