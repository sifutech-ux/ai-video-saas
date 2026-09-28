import { NextResponse } from 'next/server'
import Replicate from 'replicate'
import { denied, requireStudio } from '@/lib/studio-guard'
import { ownsJob } from '@/lib/studio-session'
import { allowedMediaUrl, firstOutputUrl } from '@/lib/media-url'

export async function GET(req: Request) {
  const session = await requireStudio()
  if (denied(session)) return session

  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id || !ownsJob(session, id)) {
    return NextResponse.json({ error: 'Video ini tidak ada dalam sesi anda.' }, { status: 403 })
  }

  try {
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
    const prediction = await replicate.predictions.get(id)
    if (prediction.status !== 'succeeded') {
      return NextResponse.json({ error: 'Video belum siap untuk dimuat turun.' }, { status: 409 })
    }
    const mediaUrl = firstOutputUrl(prediction.output)
    if (!allowedMediaUrl(mediaUrl)) {
      return NextResponse.json({ error: 'Pautan video tidak dikenali.' }, { status: 502 })
    }

    const upstream = await fetch(mediaUrl, { redirect: 'manual' })
    if (upstream.status >= 300 && upstream.status < 400) {
      const nextUrl = upstream.headers.get('location') || ''
      if (!allowedMediaUrl(nextUrl)) {
        return NextResponse.json({ error: 'Pautan video tidak dikenali.' }, { status: 502 })
      }
      const file = await fetch(nextUrl)
      if (!file.ok || !file.body) {
        return NextResponse.json({ error: 'Video tidak dapat dimuat turun.' }, { status: 502 })
      }
      return new NextResponse(file.body, {
        headers: {
          'Content-Type': file.headers.get('content-type') || 'video/mp4',
          'Content-Disposition': 'attachment; filename="beshare-video.mp4"',
          'Cache-Control': 'private, no-store',
        },
      })
    }

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'Video tidak dapat dimuat turun.' }, { status: 502 })
    }

    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'video/mp4',
        'Content-Disposition': 'attachment; filename="beshare-video.mp4"',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memuat turun video.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
