import { NextResponse } from 'next/server'
import Replicate from 'replicate'
import { denied, requireStudio } from '@/lib/studio-guard'
import { writeSession } from '@/lib/studio-cookie'
import { rememberJob, START_CREDITS } from '@/lib/studio-session'
import { cleanAspect, directStudioPrompt } from '@/lib/studio-prompt'
import { audioDataUrl, presenterVoice, synthesizeMalay } from '@/lib/malay-voice'
import { OMNI_MODEL, omniHumanInput, SADTALKER_VERSION, sadTalkerInput } from '@/lib/avatar-motion'

export const maxDuration = 60
export const runtime = 'nodejs'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

function publicGenerateError(message: string) {
  if (/authentication token|Unauthenticated/i.test(message)) {
    return 'Pelayan video belum disambungkan. Kredit tidak ditolak.'
  }
  const clean = message.replace(/\s+/g, ' ').trim()
  if (clean.startsWith('Sila ')) return clean
  return clean.length > 240 ? `${clean.slice(0, 240)}…` : clean
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function POST(req: Request) {
  const session = await requireStudio()
  if (denied(session)) return session

  let charged = false

  try {
    const body = await req.json()
    const { prompt, aspectRatio, imageUrl, type, scriptMalay, customAudio, style, voice } = body
    const spokenVoice = presenterVoice(voice)

    if (!imageUrl && type === 'avatar') {
      return NextResponse.json({ error: 'Sila muat naik Gambar Avatar!' }, { status: 400 })
    }

    const studio = !type
    if (studio && !prompt && !imageUrl) {
      return NextResponse.json({ error: 'Sila masukkan prompt teks atau muat naik gambar.' }, { status: 400 })
    }
    if (typeof imageUrl === 'string' && imageUrl.length > 2_500_000) {
      return NextResponse.json({ error: 'Gambar terlalu besar. Sila guna gambar yang lebih kecil.' }, { status: 413 })
    }

    if (studio) {
      if (session.credits < 1) {
        return NextResponse.json({ error: 'Baki kredit tidak mencukupi.', credits: session.credits }, { status: 402 })
      }
      session.credits -= 1
      charged = true
    }

    let prediction
    let enhancedPrompt = ''

    if (type === 'avatar' && imageUrl) {
      let finalAudio = customAudio

      if (!finalAudio && scriptMalay) {
        finalAudio = audioDataUrl(await synthesizeMalay(scriptMalay, spokenVoice))
      }

      if (!finalAudio) {
        throw new Error('Sila muat naik fail audio suara atau sediakan skrip!')
      }

      const createAvatarPrediction = async (retryCount = 0): Promise<any> => {
        try {
          return await replicate.predictions.create({
            model: OMNI_MODEL,
            input: omniHumanInput(imageUrl, finalAudio),
          })
        } catch (err: any) {
          if ((err?.status === 429 || err?.message?.includes('429')) && retryCount < 2) {
            await sleep(10500)
            return createAvatarPrediction(retryCount + 1)
          }
          console.warn('Gerakan semula jadi tidak tersedia, sandaran SadTalker.', err instanceof Error ? err.message : err)
          return replicate.predictions.create({
            version: SADTALKER_VERSION,
            input: sadTalkerInput(imageUrl, finalAudio),
          })
        }
      }

      prediction = await createAvatarPrediction()
    } else {
      const aspect = cleanAspect(aspectRatio)
      if (studio) {
        enhancedPrompt = await directStudioPrompt({
          prompt: typeof prompt === 'string' ? prompt : '',
          style: typeof style === 'string' ? style : 'Cinematic',
          aspectRatio: aspect,
        })
      }
      let finalPrompt = enhancedPrompt || (typeof prompt === 'string' ? prompt : '')
      if (imageUrl) {
        finalPrompt = `${finalPrompt} Subtle natural movement, continuous shot, preserve the reference image.`
      }

      prediction = await replicate.predictions.create({
        model: 'minimax/video-01',
        input: {
          prompt: finalPrompt,
          aspect_ratio: aspect,
          prompt_optimizer: false,
          first_frame_image: imageUrl || undefined,
        },
      })
    }

    if (!prediction?.id) throw new Error('Pelayan video tidak memulangkan nombor tugasan.')
    if (studio) {
      rememberJob(session, prediction.id)
      await writeSession(session)
    }

    return NextResponse.json({
      success: true,
      jobId: prediction.id,
      status: prediction.status,
      enhancedPrompt,
      credits: session.credits,
    })
  } catch (error: any) {
    console.error('Ralat API Generate:', error instanceof Error ? error.message : error)
    if (charged) {
      session.credits = Math.min(START_CREDITS, session.credits + 1)
      await writeSession(session)
    }
    const message = publicGenerateError(error?.message || 'Penjanaan gagal.')
    return NextResponse.json(
      { error: message, credits: session.credits },
      { status: message.startsWith('Sila ') ? 400 : 500 }
    )
  }
}
