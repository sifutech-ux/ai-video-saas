import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { text } = await req.json()

    if (!text) {
      return NextResponse.json(
        { error: 'Sila masukkan teks skrip!' },
        { status: 400 }
      )
    }

    // Menggunakan enjin TTS Bahasa Melayu (ms-MY) yang pantas
    const encodedText = encodeURIComponent(text)
    const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=ms&client=tw-ob`

    return NextResponse.json({
      success: true,
      audioUrl: audioUrl,
    })
  } catch (error: any) {
    console.error('Ralat API TTS:', error)
    return NextResponse.json(
      { error: 'Gagal menjana audio suara: ' + error.message },
      { status: 500 }
    )
  }
}
