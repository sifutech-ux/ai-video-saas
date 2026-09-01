import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import fs from 'fs'
import path from 'path'
import os from 'os'

export async function POST(req: Request) {
  try {
    const { videoUrls } = await req.json()

    if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length === 0) {
      return NextResponse.json({ error: 'Sila sediakan senarai URL video!' }, { status: 400 })
    }

    const tmpDir = os.tmpdir()
    const fileListPath = path.join(tmpDir, `filelist-${Date.now()}.txt`)
    const outputPath = path.join(tmpDir, `stitched-${Date.now()}.mp4`)
    const downloadedFiles: string[] = []

    // 1. Muat turun setiap fail klip ke direktori sementara
    for (let i = 0; i < videoUrls.length; i++) {
      const response = await fetch(videoUrls[i])
      const buffer = await response.arrayBuffer()
      const filePath = path.join(tmpDir, `input-${Date.now()}-${i}.mp4`)
      fs.writeFileSync(filePath, Buffer.from(buffer))
      downloadedFiles.push(filePath)
    }

    // 2. Tulis senarai fail untuk dicantumkan oleh FFmpeg
    const fileListContent = downloadedFiles.map((file) => `file '${file}'`).join('\n')
    fs.writeFileSync(fileListPath, fileListContent)

    // 3. Jalankan arahan FFmpeg Concat
    const command = `"${ffmpegPath}" -f concat -safe 0 -i "${fileListPath}" -c copy "${outputPath}"`
    execSync(command)

    // 4. Baca fail hasil gabungan
    const stitchedBuffer = fs.readFileSync(outputPath)

    // 5. Bersihkan fail-fail sementara
    downloadedFiles.forEach((file) => fs.existsSync(file) && fs.unlinkSync(file))
    fs.existsSync(fileListPath) && fs.unlinkSync(fileListPath)
    fs.existsSync(outputPath) && fs.unlinkSync(outputPath)

    // 6. Pulangkan video berbentuk Base64 Data URL
    const base64Video = `data:video/mp4;base64,${stitchedBuffer.toString('base64')}`

    return NextResponse.json({
      success: true,
      stitchedVideoUrl: base64Video,
    })
  } catch (error: any) {
    console.error('Ralat Pencantum Video:', error)
    return NextResponse.json(
      { error: 'Gagal mencantumkan video: ' + error.message },
      { status: 500 }
    )
  }
}
