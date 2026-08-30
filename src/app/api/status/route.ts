import { NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! })

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID tugasan diperlukan' }, { status: 400 })
  }

  try {
    const prediction = await replicate.predictions.get(id)
    return NextResponse.json(prediction)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}