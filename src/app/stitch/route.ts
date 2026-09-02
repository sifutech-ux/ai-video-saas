import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import fs from 'fs'
import path from 'path'
import os from 'os'

export async function POST(req: Request) {
  try {
    const { scenes, gender = 'male' } = await req.json()

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json({ error: 'Sila sediakan data adegan!' }, { status: 400 })
    }

    const tmpDir = os.tmpdir()
    const processedVideoFiles: string[] = []
    const fileListPath = path.join(tmpDir, `filelist-${Date.now()}.txt`)
    const finalOutputPath = path.join(tmpDir, `final-ugc-${Date.now()}.mp4`)

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      if (!scene.url) continue

      const videoRes = await fetch(scene.url)
      const videoBuffer = await videoRes.arrayBuffer()
      const videoPath = path.join(tmpDir, `raw-video-${i}.mp4`)
      fs.writeFileSync(videoPath, Buffer.from(videoBuffer))

      const processedPath = path.join(tmpDir, `processed-scene-${i}.mp4`)

      // Cantum audio Google TTS hanya pada adegan B-Roll
      if (scene.scriptMalay && scene.type === 'b-roll') {
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(scene.scriptMalay)}&tl=ms&client=tw-ob`
        
        try {
          const audioRes = await fetch(ttsUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          })
          if (audioRes.ok) {
            const audioBuffer = await audioRes.arrayBuffer()
            const audioPath = path.join(tmpDir, `audio-${i}.mp3`)
            fs.writeFileSync(audioPath, Buffer.from(audioBuffer))

            const mergeCmd = `"${ffmpegPath}" -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -b:a 192k -shortest "${processedPath}"`
            execSync(mergeCmd)

            fs.existsSync(videoPath) && fs.unlinkSync(videoPath)
            fs.existsSync(audioPath) && fs.unlinkSync(audioPath)
            processedVideoFiles.push(processedPath)
            continue
          }
        } catch (e) {
          console.warn(`Gagal gabung audio adegan ${i}:`, e)
        }
      }
      processedVideoFiles.push(videoPath)
    }

    const fileListContent = processedVideoFiles.map((file) => `file '${file}'`).join('\n')
    fs.writeFileSync(fileListPath, fileListContent)

    const concatCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${fileListPath}" -c copy "${finalOutputPath}"`
    execSync(concatCmd)

    const stitchedBuffer = fs.readFileSync(finalOutputPath)

    // Pembersihan fail sementara
    processedVideoFiles.forEach((f) => fs.existsSync(f) && fs.unlinkSync(f))
    fs.existsSync(fileListPath) && fs.unlinkSync(fileListPath)
    fs.existsSync(finalOutputPath) && fs.unlinkSync(finalOutputPath)

    // Pulangkan sebagai aliran fail MP4 tulen (Elak ralat Base64)
    return new NextResponse(stitchedBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'inline; filename="ugc-full.mp4"',
      },
    })
  } catch (error: any) {
    console.error('Ralat Pencantum Video:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
