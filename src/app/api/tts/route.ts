import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { text, gender = 'female' } = await req.json()

    if (!text) {
      return NextResponse.json({ error: 'Sila masukkan teks!' }, { status: 400 })
    }

    // Menggunakan Microsoft Azure Neural Voice (Yasmin / Osman)
    const voice = gender === 'male' ? 'ms-MY-OsmanNeural' : 'ms-MY-YasminNeural'
    const encodedText = encodeURIComponent(text)
    const audioUrl = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodedText}`

    return NextResponse.json({
      success: true,
      audioUrl,
    })
  } catch (error: any) {
    console.error('Ralat API TTS:', error)
    return NextResponse.json(
      { error: 'Gagal menjana audio suara: ' + error.message },
      { status: 500 }
    )
  }
}
