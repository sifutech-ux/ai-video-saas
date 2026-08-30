import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import Replicate from 'replicate'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! })

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json()

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt diperlukan' }, { status: 400 })
    }

    // 1. Optimasi Prompt menggunakan Gemini API (dengan fallback keselamatan)
    let enhancedPrompt = prompt
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Enhance this prompt for AI video generation (cinematic, highly detailed, photorealistic): ${prompt}`,
      })
      if (response.text) {
        enhancedPrompt = response.text
      }
    } catch (geminiError) {
      console.warn('Optimasi Gemini dilepaskan, menggunakan prompt asal:', geminiError)
    }

    // 2. Hantar arahan ke Replicate (Minimax Video Model)
    const prediction = await replicate.predictions.create({
      version: "minimax/video-01",
      input: {
        prompt: enhancedPrompt
      }
    })

    return NextResponse.json({
      success: true,
      jobId: prediction.id,
      enhancedPrompt: enhancedPrompt,
      status: prediction.status
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}