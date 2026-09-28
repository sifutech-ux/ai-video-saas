import assert from 'node:assert/strict'
import test from 'node:test'
import {
  freshSession,
  readSigned,
  rememberJob,
  sameSecret,
  settleJob,
  signSession,
} from '../src/lib/studio-session.ts'
import { allowedMediaUrl } from '../src/lib/media-url.ts'
import { ensureStyle, fallbackPrompt } from '../src/lib/studio-prompt.ts'
import { geminiVoiceName, pcmToWav, presenterVoice, speechChunks, speechDirection } from '../src/lib/malay-voice.ts'
import { dressStoryboard, scriptPrompt, ugcDirection, withDirectionLook } from '../src/lib/ugc-direction.ts'
import { decodeDataUrl, providerBusy, publicVideoError } from '../src/lib/replicate-media.ts'
import { omniHumanInput, sadTalkerInput } from '../src/lib/avatar-motion.ts'
import { parseStoryboard, publicGeminiError } from '../src/lib/gemini-text.ts'
import { stitchSceneFiles } from '../src/lib/ugc-stitch.ts'
import { execFileSync } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('kata laluan yang sama lulus, yang lain gagal', () => {
  assert.equal(sameSecret('studio-rahsia', 'studio-rahsia'), true)
  assert.equal(sameSecret('salah', 'studio-rahsia'), false)
  assert.equal(sameSecret('', 'studio-rahsia'), false)
})

test('sesi yang diubah tandatangan ditolak', () => {
  const session = freshSession(1_000)
  const token = signSession(session, 'rahsia')
  const opened = readSigned(token, 'rahsia', 1_000)
  assert.equal(opened?.credits, 2)
  assert.equal(readSigned(token, 'lain', 1_000), null)
  assert.equal(readSigned(`${token}x`, 'rahsia', 1_000), null)
  assert.equal(readSigned(token, 'rahsia', session.exp + 1), null)
})

test('kredit dipulangkan sekali sahaja bila gagal', () => {
  const session = freshSession()
  session.credits = 1
  rememberJob(session, 'job-1')
  const failed = settleJob(session, 'job-1', 'gagal')
  assert.equal(failed.changed, true)
  assert.equal(failed.credits, 2)
  const again = settleJob(session, 'job-1', 'gagal')
  assert.equal(again.changed, false)
  assert.equal(again.credits, 2)
})

test('video yang siap tidak memulangkan kredit', () => {
  const session = freshSession()
  session.credits = 1
  rememberJob(session, 'job-2')
  const done = settleJob(session, 'job-2', 'siap')
  assert.equal(done.credits, 1)
  assert.equal(settleJob(session, 'job-2', 'gagal').changed, false)
})

test('gaya vintage masuk ke arahan sandaran', () => {
  const text = fallbackPrompt('buat satu video vintage', 'Vintage Film', '16:9')
  assert.match(text, /buat satu video vintage/)
  assert.match(text, /vintage 16mm film/)
  assert.match(text, /16:9/)
  const kept = ensureStyle('A warm vintage 16mm film of a street.', 'Vintage Film', '16:9')
  assert.equal(kept, 'A warm vintage 16mm film of a street.')
  const added = ensureStyle('A cat in space.', 'Vintage Film', '16:9')
  assert.match(added, /vintage 16mm film/)
})

test('muat turun hanya benarkan hos Replicate', () => {
  assert.equal(allowedMediaUrl('https://replicate.delivery/pbxt/file.mp4'), true)
  assert.equal(allowedMediaUrl('https://pbxt.replicate.delivery/file.mp4'), true)
  assert.equal(allowedMediaUrl('https://example.com/file.mp4'), false)
  assert.equal(allowedMediaUrl('http://replicate.delivery/file.mp4'), false)
  assert.equal(allowedMediaUrl('not a url'), false)
})

test('papan cerita menerima JSON yang dibalut ayat', () => {
  const board = parseStoryboard('Ini dia:\n{"title":"Lemon","scenes":[{"sceneNumber":1},{"sceneNumber":2}]}')
  assert.equal(board.title, 'Lemon')
  assert.equal(board.scenes?.length, 2)
  assert.throws(() => parseStoryboard('tiada json'))
  const previous = process.env.GEMINI_API_KEY
  process.env.GEMINI_API_KEY = 'ujian'
  try {
    assert.match(publicGeminiError('models/gemini-2.5-flash is not found'), /Model Gemini lama/)
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previous
  }
  assert.match(publicGeminiError(''), /belum ditetapkan/)
})

test('skrip panjang dipecahkan supaya suara tidak terputus', () => {
  const chunks = speechChunks('Ayat pertama yang pendek. ' + 'B'.repeat(200) + '. Ayat akhir sekali.')
  assert.ok(chunks.length >= 3)
  assert.ok(chunks.every((chunk) => chunk.length <= 180))
  const wav = pcmToWav(Buffer.alloc(200, 1))
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF')
  assert.equal(wav.length, 244)
})

test('suara lalai lelaki dan gerakan avatar licin', () => {
  assert.equal(presenterVoice(undefined), 'lelaki')
  assert.equal(presenterVoice('perempuan'), 'perempuan')
  assert.equal(presenterVoice('lain'), 'lelaki')
  assert.equal(geminiVoiceName('lelaki'), 'Charon')
  assert.equal(geminiVoiceName('perempuan'), 'Kore')
  assert.match(speechDirection('Minum ini.', 'lelaki'), /lelaki dewasa/)
  const motion = omniHumanInput('data:image/jpeg;base64,abc', 'data:audio/wav;base64,def')
  assert.equal(motion.fast_mode, false)
  assert.match(motion.prompt, /talks naturally/)
  assert.equal(motion.image.startsWith('data:image'), true)
  assert.equal(sadTalkerInput('img', 'aud').still, false)
})

test('arah iklan menukar skrip dan klip produk', () => {
  assert.equal(ugcDirection(undefined), 'santai')
  assert.equal(ugcDirection('live'), 'live')
  assert.equal(ugcDirection('lain'), 'santai')
  const live = scriptPrompt({
    productName: 'Lemon',
    productBenefits: 'lancar',
    targetAudience: 'ibu',
    direction: 'live',
  })
  assert.match(live, /Live Selling/)
  assert.match(live, /beli sekarang/)
  const beauty = scriptPrompt({
    productName: 'Krim',
    productBenefits: 'lembut',
    targetAudience: '',
    direction: 'kecantikan',
  })
  assert.match(beauty, /meja solek/)
  assert.match(beauty, /rajah kulit/)
  const launch = scriptPrompt({
    productName: 'Telefon',
    productBenefits: 'tahan',
    targetAudience: 'umum',
    direction: 'pelancaran',
  })
  assert.match(launch, /pelamin/)
  const dressed = dressStoryboard(
    { title: 'Lemon', scenes: [{ type: 'b-roll', visualPrompt: 'A lemon drink.' }, { type: 'avatar', visualPrompt: 'A man talks.' }] },
    'live'
  )
  assert.match(dressed.scenes[0].visualPrompt, /bright live-selling table/i)
  assert.equal(withDirectionLook(dressed.scenes[0].visualPrompt, 'live', 'b-roll'), dressed.scenes[0].visualPrompt)
  assert.match(dressed.scenes[1].visualPrompt, /original photo/)
})

test('ralat muat naik video dipendekkan', () => {
  const raw = 'Failed to get video result: {"code":50501,"message":"Internal RPC Error Upload file failed EulerError"}'
  assert.equal(providerBusy(raw), true)
  assert.equal(publicVideoError(raw), 'Pelayan video sedang sibuk. Sila jana adegan ini sekali lagi.')
  assert.equal(providerBusy('Service is temporarily unavailable. Please try again later. (E004)'), true)
  const png = Buffer.from('89504e470d0a1a0a' + '00'.repeat(40), 'hex')
  const url = `data:image/png;base64,${png.toString('base64')}`
  const decoded = decodeDataUrl(url)
  assert.equal(decoded?.mime, 'image/png')
  assert.equal(decoded?.name, 'gambar.png')
  assert.ok((decoded?.bytes.length || 0) > 32)
  assert.equal(decodeDataUrl('https://replicate.delivery/file.jpg'), null)
})

test('dua klip dicantum menjadi satu video', () => {
  assert.ok(ffmpegPath)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-test-'))
  const makeClip = (name: string, color: string) => {
    const file = path.join(dir, name)
    execFileSync(ffmpegPath as string, [
      '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=320x568:d=1`,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', file,
    ], { stdio: 'pipe' })
    return fs.readFileSync(file)
  }
  const output = stitchSceneFiles([
    { video: makeClip('a.mp4', 'blue') },
    { video: makeClip('b.mp4', 'purple'), audio: pcmToWav(Buffer.alloc(4800)) },
  ])
  assert.ok(output.length > 1000)
  assert.equal(output.subarray(4, 8).toString(), 'ftyp')
  fs.rmSync(dir, { recursive: true, force: true })
})
