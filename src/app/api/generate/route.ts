import { NextResponse } from 'next/server'
import Replicate from 'replicate'
import { denied, requireStudio } from '@/lib/studio-guard'
import { writeSession } from '@/lib/studio-cookie'
import { rememberJob, START_CREDITS } from '@/lib/studio-session'
import { cleanAspect, directStudioPrompt } from '@/lib/studio-prompt'
import { audioDataUrl, presenterVoice, synthesizeMalay } from '@/lib/malay-voice'
import { OMNI_MODEL, omniHumanInput, SADTALKER_VERSION, sadTalkerInput } from '@/lib/avatar-motion'
import { placePrompt, ugcDirection, withDirectionLook } from '@/lib/ugc-direction'
import { hostedAssetUrl, publicVideoError } from '@/lib/replicate-media'
import { restageImage } from '@/lib/restage-image'

export const maxDuration = 60
export const runtime = 'nodejs'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

function publicGenerateError(message: string) {
  const text = publicVideoError(message)
  if (text === 'Pelayan video belum disambungkan.') return 'Pelayan video belum disambungkan. Kredit tidak ditolak.'
  return text
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
    const spokenDirection = ugcDirection(body.direction)
    const sandaran = body.motion === 'sandaran'

    const asHosted = async (value: string) => {
      if (!value.startsWith('data:')) return value
      try {
        return await hostedAssetUrl(replicate, value)
      } catch (error) {
        console.warn('Pautan media tidak tersedia, data asal digunakan.', error instanceof Error ? error.message : error)
        return value
      }
    }

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
      const stagedPromise = restageImage(imageUrl, placePrompt(spokenDirection, 'orang'))
      let finalAudio = customAudio

      if (!finalAudio && scriptMalay) {
        finalAudio = audioDataUrl(await synthesizeMalay(scriptMalay, spokenVoice))
      }

      if (!finalAudio) {
        throw new Error('Sila muat naik fail audio suara atau sediakan skrip!')
      }

      const staged = await stagedPromise
      const imageHosted = await asHosted(staged || imageUrl)
      const audioHosted = await asHosted(finalAudio)

      const createSadTalker = () =>
        replicate.predictions.create({
          version: SADTALKER_VERSION,
          input: sadTalkerInput(imageHosted, audioHosted),
        })

      const createAvatarPrediction = async (retryCount = 0): Promise<any> => {
        if (sandaran) return createSadTalker()
        try {
          return await replicate.predictions.create({
            model: OMNI_MODEL,
            input: omniHumanInput(imageHosted, audioHosted, spokenDirection),
          })
        } catch (err: any) {
          if ((err?.status === 429 || err?.message?.includes('429')) && retryCount < 2) {
            await sleep(10500)
            return createAvatarPrediction(retryCount + 1)
          }
          console.warn('Gerakan semula jadi tidak tersedia, sandaran SadTalker.', err instanceof Error ? err.message : err)
          return createSadTalker()
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
      if (type === 'b-roll') {
        finalPrompt = withDirectionLook(finalPrompt, spokenDirection, 'b-roll')
      }
      if (imageUrl) {
        finalPrompt = `${finalPrompt} Subtle natural movement, continuous shot, preserve the reference image.`
      }
      let frame = typeof imageUrl === 'string' ? imageUrl : ''
      if (type === 'b-roll' && frame) {
        frame = (await restageImage(frame, placePrompt(spokenDirection, 'produk'))) || frame
      }
      const frameImage = frame ? await asHosted(frame) : undefined

      prediction = await replicate.predictions.create({
        model: 'minimax/video-01',
        input: {
          prompt: finalPrompt,
          aspect_ratio: aspect,
          prompt_optimizer: false,
          first_frame_image: frameImage,
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
