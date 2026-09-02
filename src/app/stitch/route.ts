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

    // Tetapkan nama suara Azure Neural mengikut pilihan jantina
    const voiceName = gender === 'female' ? 'ms-MY-YasminNeural' : 'ms-MY-OsmanNeural'

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      if (!scene.url) continue

      const videoRes = await fetch(scene.url)
      const videoBuffer = await videoRes.arrayBuffer()
      const videoPath = path.join(tmpDir, `raw-video-${i}.mp4`)
      fs.writeFileSync(videoPath, Buffer.from(videoBuffer))

      const processedPath = path.join(tmpDir, `processed-scene-${i}.mp4`)

      if (scene.scriptMalay) {
        const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=${voiceName}&text=${encodeURIComponent(scene.scriptMalay)}`
        
        try {
          const audioRes = await fetch(ttsUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            },
          })
          
          if (audioRes.ok) {
            const audioBuffer = await audioRes.arrayBuffer()
            const audioPath = path.join(tmpDir, `audio-${i}.mp3`)
            fs.writeFileSync(audioPath, Buffer.from(audioBuffer))

            // Gabungkan video Minimax dengan Audio Suara Lelaki Osman
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

    processedVideoFiles.forEach((f) => fs.existsSync(f) && fs.unlinkSync(f))
    fs.existsSync(fileListPath) && fs.unlinkSync(fileListPath)
    fs.existsSync(finalOutputPath) && fs.unlinkSync(finalOutputPath)

    const base64Video = `data:video/mp4;base64,${stitchedBuffer.toString('base64')}`
    return NextResponse.json({ success: true, stitchedVideoUrl: base64Video })
  } catch (error: any) {
    console.error('Ralat Pencantum Video:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
