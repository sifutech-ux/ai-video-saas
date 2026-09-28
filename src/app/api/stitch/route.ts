import { NextResponse } from 'next/server'
import { denied, requireStudio } from '@/lib/studio-guard'
import { fetchAllowedMedia } from '@/lib/media-url'
import { presenterVoice, synthesizeMalay } from '@/lib/malay-voice'
import { stitchSceneFiles, type StitchScene } from '@/lib/ugc-stitch'

export const maxDuration = 60
export const runtime = 'nodejs'

type IncomingScene = {
  url?: string
  scriptMalay?: string
  type?: string
}

export async function POST(req: Request) {
  const session = await requireStudio()
  if (denied(session)) return session

  try {
    const body = await req.json()
    const scenes = Array.isArray(body.scenes) ? (body.scenes as IncomingScene[]) : []
    const spokenVoice = presenterVoice(body.voice)
    const ready = scenes.filter((scene) => typeof scene.url === 'string' && scene.url)
    if (ready.length < 2) {
      return NextResponse.json({ error: 'Sila sediakan sekurang-kurangnya 2 adegan.' }, { status: 400 })
    }
    if (ready.length > 4) {
      return NextResponse.json({ error: 'Cantuman dihadkan kepada 4 adegan.' }, { status: 400 })
    }

    const prepared: StitchScene[] = []
    for (const scene of ready) {
      const video = await fetchAllowedMedia(scene.url as string)
      let audio: Buffer | null = null
      if (scene.type === 'b-roll' && scene.scriptMalay) {
        try {
          audio = (await synthesizeMalay(scene.scriptMalay, spokenVoice)).buffer
        } catch (error) {
          console.warn('Suara b-roll tidak digabung.', error instanceof Error ? error.message : error)
        }
      }
      prepared.push({ video, audio })
    }

    const file = stitchSceneFiles(prepared)
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'inline; filename="ugc-full.mp4"',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mencantumkan video.'
    console.error('Ralat cantuman video:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
