import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import fs from 'fs'
import path from 'path'
import os from 'os'

export async function POST(req: Request) {
  try {
    const { scenes } = await req.json() // Menerima senarai scenes beserta URL video dan skrip BM

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

      // 1. Muat turun video
      const videoRes = await fetch(scene.url)
      const videoBuffer = await videoRes.arrayBuffer()
      const videoPath = path.join(tmpDir, `raw-video-${i}.mp4`)
      fs.writeFileSync(videoPath, Buffer.from(videoBuffer))

      // 2. Jana & muat turun Audio Neural BM jika ada skrip
      const processedPath = path.join(tmpDir, `processed-scene-${i}.mp4`)
      if (scene.scriptMalay) {
        const voice = scene.type === 'avatar' ? 'ms-MY-YasminNeural' : 'ms-MY-OsmanNeural'
        const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(scene.scriptMalay)}`
        
        const audioRes = await fetch(ttsUrl)
        const audioBuffer = await audioRes.arrayBuffer()
        const audioPath = path.join(tmpDir, `audio-${i}.mp3`)
        fs.writeFileSync(audioPath, Buffer.from(audioBuffer))

        // Gabung Video + Audio Suara menggunakan FFmpeg
        const mergeCmd = `"${ffmpegPath}" -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest "${processedPath}"`
        execSync(mergeCmd)

        fs.unlinkSync(videoPath)
        fs.unlinkSync(audioPath)
        processedVideoFiles.push(processedPath)
      } else {
        processedVideoFiles.push(videoPath)
      }
    }

    // 3. Cantumkan kesemua klip ber-audio menjadi 1 video penuh
    const fileListContent = processedVideoFiles.map((file) => `file '${file}'`).join('\n')
    fs.writeFileSync(fileListPath, fileListContent)

    const concatCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${fileListPath}" -c copy "${finalOutputPath}"`
    execSync(concatCmd)

    const stitchedBuffer = fs.readFileSync(finalOutputPath)

    // Bersihkan fail sementara
    processedVideoFiles.forEach((f) => fs.existsSync(f) && fs.unlinkSync(f))
    fs.existsSync(fileListPath) && fs.unlinkSync(fileListPath)
    fs.existsSync(finalOutputPath) && fs.unlinkSync(finalOutputPath)

    const base64Video = `data:video/mp4;base64,${stitchedBuffer.toString('base64')}`

    return NextResponse.json({
      success: true,
      stitchedVideoUrl: base64Video,
    })
  } catch (error: any) {
    console.error('Ralat Pencantum Video & Audio:', error)
    return NextResponse.json(
      { error: 'Gagal mencantumkan video: ' + error.message },
      { status: 500 }
    )
  }
}
