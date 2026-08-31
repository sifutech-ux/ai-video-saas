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

    let enhancedPrompt = prompt || 'Animate this image with smooth cinematic movement and realistic motion'

    try {
      const audioInstruction = enableAudio
        ? ' Include immersive sound effect descriptions and auditory atmosphere.'
        : ''

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Enhance this prompt for AI video generation with visual style "${style || 'Cinematic'}". Make it photorealistic, highly detailed, and engaging.${audioInstruction} User prompt: "${enhancedPrompt}"`,
      })

      if (response.text) {
        enhancedPrompt = response.text.trim()
      }
    } catch (geminiError) {
      console.warn('Optimasi Gemini dilepaskan, menggunakan prompt asal:', geminiError)
    }

    const inputPayload: Record<string, any> = {
      prompt: enhancedPrompt,
      aspect_ratio: aspectRatio || '16:9',
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
      enhancedPrompt: enhancedPrompt,
      status: prediction.status,
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
