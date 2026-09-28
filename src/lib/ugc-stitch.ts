import { execFileSync } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import fs from 'fs'
import os from 'os'
import path from 'path'

export type StitchScene = {
  video: Buffer
  audio?: Buffer | null
}

function ffmpeg() {
  if (!ffmpegPath) throw new Error('Alat cantuman video tidak tersedia pada pelayan ini.')
  return ffmpegPath
}

function run(args: string[]) {
  execFileSync(ffmpeg(), args, { stdio: 'pipe' })
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
      const scale = 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1'
      if (scene.audio && scene.audio.length > 0) {
        const audioPath = path.join(dir, `audio-${index}`)
        fs.writeFileSync(audioPath, scene.audio)
        run([
          '-y',
          '-i', videoPath,
          '-i', audioPath,
          '-vf', scale,
          '-r', '24',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-ar', '44100',
          '-ac', '2',
          '-shortest',
          outPath,
        ])
      } else {
        run([
          '-y',
          '-i', videoPath,
          '-f', 'lavfi',
          '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-vf', scale,
          '-r', '24',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-ar', '44100',
          '-ac', '2',
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
