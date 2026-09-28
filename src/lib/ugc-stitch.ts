import { execFileSync, spawnSync } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import fs from 'fs'
import os from 'os'
import path from 'path'

export type StitchScene = {
  video: Buffer
  audio?: Buffer | null
}

export function resolveFfmpeg(
  candidates: Array<string | null | undefined>,
  exists: (file: string) => boolean
) {
  const found = candidates.find((candidate) => typeof candidate === 'string' && candidate.length > 0 && exists(candidate))
  if (!found) throw new Error('Alat cantuman video tidak tersedia pada pelayan ini.')
  return found
}

export function publicStitchError(message: string) {
  if (/ENOENT|spawnSync/i.test(message)) {
    return 'Cantuman video belum tersedia pada pelayan. Sila cuba sekali lagi.'
  }
  return message
}

function ffmpeg() {
  return resolveFfmpeg(
    [path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'), ffmpegPath],
    (file) => fs.existsSync(file)
  )
}

function run(args: string[]) {
  execFileSync(ffmpeg(), args, { stdio: 'pipe' })
}

function clipHasAudio(file: string) {
  const result = spawnSync(ffmpeg(), ['-hide_banner', '-i', file], { encoding: 'utf8' })
  return /Audio:/.test(result.stderr || '')
}

const VIDEO_ENCODE = ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac']

export function framePadSeconds(videoSeconds: number, audioSeconds: number, maxPad = 10) {
  if (!(videoSeconds >= 0.2) || !(audioSeconds >= 0.2)) return 0
  const gap = audioSeconds - videoSeconds
  if (gap < 0.3) return 0
  return Math.min(maxPad, Math.round(gap * 100) / 100)
}

function probeSeconds(file: string) {
  const result = spawnSync(ffmpeg(), ['-hide_banner', '-i', file], { encoding: 'utf8' })
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(result.stderr || '')
  if (!match) return 0
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

function pictureFilter(padSeconds: number) {
  const base = 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24'
  return padSeconds > 0 ? `${base},tpad=stop_mode=clone:stop_duration=${padSeconds}` : base
}

export function stitchSceneFiles(scenes: StitchScene[]) {
  if (scenes.length < 2) throw new Error('Sila sediakan sekurang-kurangnya 2 adegan.')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-'))
  const normalized: string[] = []

  try {
    scenes.forEach((scene, index) => {
      const videoPath = path.join(dir, `in-${index}.mp4`)
      const outPath = path.join(dir, `out-${index}.mp4`)
      fs.writeFileSync(videoPath, scene.video)
      const still = pictureFilter(0)
      if (scene.audio && scene.audio.length > 0) {
        const audioPath = path.join(dir, `audio-${index}`)
        fs.writeFileSync(audioPath, scene.audio)
        const picture = pictureFilter(framePadSeconds(probeSeconds(videoPath), probeSeconds(audioPath)))
        run([
          '-y',
          '-i', videoPath,
          '-i', audioPath,
          '-filter_complex', `[0:v]${picture}[v];[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a]`,
          '-map', '[v]',
          '-map', '[a]',
          ...VIDEO_ENCODE,
          '-shortest',
          outPath,
        ])
      } else if (clipHasAudio(videoPath)) {
        run([
          '-y',
          '-i', videoPath,
          '-filter_complex', `[0:v]${still}[v];[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a]`,
          '-map', '[v]',
          '-map', '[a]',
          ...VIDEO_ENCODE,
          '-shortest',
          outPath,
        ])
      } else {
        run([
          '-y',
          '-i', videoPath,
          '-f', 'lavfi',
          '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-filter_complex', `[0:v]${still}[v]`,
          '-map', '[v]',
          '-map', '1:a:0',
          ...VIDEO_ENCODE,
          '-shortest',
          outPath,
        ])
      }
      normalized.push(outPath)
    })

    const listPath = path.join(dir, 'list.txt')
    const finalPath = path.join(dir, 'final.mp4')
    fs.writeFileSync(listPath, normalized.map((file) => `file '${file}'`).join('\n'))
    run(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', finalPath])
    return fs.readFileSync(finalPath)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
