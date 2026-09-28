'use client'

import { useState, useRef } from 'react'
import { directionLabel, UGC_DIRECTIONS, type UgcDirection } from '@/lib/ugc-direction'

interface Scene {
  sceneNumber: number
  type: 'avatar' | 'b-roll'
  title: string
  scriptMalay: string
  visualPrompt: string
}

interface ScriptData {
  title: string
  scenes: Scene[]
}

export default function UgcStoryboard() {
  const [productName, setProductName] = useState('')
  const [productBenefits, setProductBenefits] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [buildLabel, setBuildLabel] = useState('')
  const [scriptData, setScriptData] = useState<ScriptData | null>(null)

  // State Gambar & Audio Rujukan
  const [avatarImage, setAvatarImage] = useState<string | null>(null)
  const [productImage, setProductImage] = useState<string | null>(null)

  const avatarInputRef = useRef<HTMLInputElement>(null)
  const productInputRef = useRef<HTMLInputElement>(null)

  const [stitchedVideo, setStitchedVideo] = useState('')
  const [presenterVoice, setPresenterVoice] = useState<'lelaki' | 'perempuan'>('lelaki')
  const [direction, setDirection] = useState<UgcDirection>('santai')
  const [scriptDirection, setScriptDirection] = useState<UgcDirection>('santai')

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'product') => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        if (type === 'avatar') setAvatarImage(reader.result as string)
        else setProductImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handlePlayAudio = async (text: string) => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: presenterVoice }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Gagal mendapatkan fail audio.')
      }
      const url = URL.createObjectURL(await res.blob())
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
    } catch (err: any) {
      alert(err.message || 'Ralat memainkan audio suara.')
    }
  }

  const waitForJob = (jobId: string, scene: Scene, sandaran: boolean, spoken: UgcDirection) =>
    new Promise<string>((resolve, reject) => {
      const started = Date.now()
      let misses = 0
      const interval = setInterval(async () => {
        if (Date.now() - started > 12 * 60 * 1000) {
          clearInterval(interval)
          reject(new Error('Masa tamat'))
          return
        }
        try {
          const res = await fetch(`/api/status?id=${jobId}`)
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Status tidak dapat disemak')
          misses = 0

          if (data.status === 'succeeded') {
            clearInterval(interval)
            const url = Array.isArray(data.output) ? data.output[0] : data.output
            resolve(url)
          } else if (data.status === 'failed' || data.status === 'canceled') {
            clearInterval(interval)
            if (scene.type === 'avatar' && !sandaran && data.busy) {
              setBuildLabel('Cara licin sibuk, mencuba cara lama...')
              requestScene(scene, true, spoken).then(resolve, reject)
              return
            }
            reject(new Error(data.error || 'Penjanaan video gagal di pelayan AI.'))
          }
        } catch (err) {
          misses += 1
          if (misses >= 5) {
            clearInterval(interval)
            console.error('Ralat status adegan:', err)
            reject(err instanceof Error ? err : new Error('Sambungan terputus'))
          }
        }
      }, 4000)
    })

  const requestScene = async (scene: Scene, sandaran = false, spoken: UgcDirection = scriptDirection) => {
    const selectedImage = scene.type === 'avatar' ? avatarImage : productImage
    if (scene.type === 'avatar' && !selectedImage) {
      throw new Error(`Sila muat naik gambar orang untuk adegan ${scene.sceneNumber}.`)
    }
    if (scene.type === 'b-roll' && !selectedImage) {
      throw new Error('Sila muat naik gambar produk.')
    }

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: scene.visualPrompt,
        aspectRatio: '9:16',
        imageUrl: selectedImage,
        type: scene.type,
        scriptMalay: scene.scriptMalay,
        voice: presenterVoice,
        direction: spoken,
        motion: sandaran ? 'sandaran' : undefined,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Gagal memproses adegan')
    return waitForJob(data.jobId, scene, sandaran, spoken)
  }

  const stitchClips = async (clips: { url: string; scriptMalay: string; type: string }[]) => {
    setBuildLabel('Menyatukan iklan...')
    const res = await fetch('/api/stitch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenes: clips, voice: presenterVoice }),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || 'Gagal mencantumkan video')
    }
    const videoBlob = await res.blob()
    setStitchedVideo((current) => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(videoBlob)
    })
  }

  const handleBuildAd = async () => {
    if (!productName || !productBenefits) {
      return alert('Sila masukkan Nama Produk dan Kelebihan Utama!')
    }
    if (!avatarImage || !productImage) {
      return alert('Sila muat naik gambar orang dan gambar produk.')
    }

    setIsLoading(true)
    setBuildLabel('Menulis skrip...')
    setStitchedVideo((current) => {
      if (current) URL.revokeObjectURL(current)
      return ''
    })
    try {
      const res = await fetch('/api/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName, productBenefits, targetAudience, direction }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menjana skrip')
      const board = data.data as ScriptData
      setScriptData(board)
      setScriptDirection(direction)

      const ready: { url: string; scriptMalay: string; type: string }[] = []
      for (const scene of board.scenes) {
        setBuildLabel(scene.type === 'b-roll' ? 'Menyusun produk...' : 'Menyusun penyampai...')
        const url = await requestScene(scene, false, direction)
        ready.push({ url, scriptMalay: scene.scriptMalay, type: scene.type })
      }

      if (ready.length < 2) throw new Error('Iklan belum lengkap. Sila cuba sekali lagi.')
      await stitchClips(ready)
    } catch (err: any) {
      alert(`Ralat: ${err.message}`)
    } finally {
      setBuildLabel('')
      setIsLoading(false)
    }
  }

  return (
    <div className="bs-panel p-6 pt-7 flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold bs-title">
          UGC Script & Storyboard
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Muat naik gambar orang dan gambar produk. Arah yang dipilih mencipta scene untuk kedua-duanya. Satu iklan siap dalam beberapa minit.
        </p>
      </div>

      {/* Bahagian Muat Naik Gambar Rujukan */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950 p-4 border border-slate-800 rounded-xl">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-purple-400 flex justify-between">
            <span>Gambar Orang</span>
            {avatarImage && (
              <button onClick={() => setAvatarImage(null)} className="text-[10px] text-red-400 hover:underline">Padam</button>
            )}
          </label>
          <input type="file" accept="image/*" ref={avatarInputRef} onChange={(e) => handleImageUpload(e, 'avatar')} className="hidden" />
          {!avatarImage ? (
            <div
              onClick={() => avatarInputRef.current?.click()}
              className="border border-dashed border-slate-800 hover:border-purple-500 p-3 rounded-xl cursor-pointer text-center bg-slate-900 transition"
            >
              <span className="text-base block mb-1">👤</span>
              <p className="text-xs text-slate-400">Muat naik gambar rujukan muka/orang</p>
            </div>
          ) : (
            <div className="w-full h-48 bg-black/60 rounded-lg p-1 border border-purple-500 flex items-center justify-center">
              <img src={avatarImage} alt="Avatar" className="max-h-full max-w-full object-contain rounded" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-purple-400 flex justify-between">
            <span>Gambar Produk</span>
            {productImage && (
              <button onClick={() => setProductImage(null)} className="text-[10px] text-red-400 hover:underline">Padam</button>
            )}
          </label>
          <input type="file" accept="image/*" ref={productInputRef} onChange={(e) => handleImageUpload(e, 'product')} className="hidden" />
          {!productImage ? (
            <div
              onClick={() => productInputRef.current?.click()}
              className="border border-dashed border-slate-800 hover:border-purple-500 p-3 rounded-xl cursor-pointer text-center bg-slate-900 transition"
            >
              <span className="text-base block mb-1">🎁</span>
              <p className="text-xs text-slate-400">Muat naik gambar rujukan produk/pek</p>
            </div>
          ) : (
            <div className="w-full h-48 bg-black/60 rounded-lg p-1 border border-purple-500 flex items-center justify-center">
              <img src={productImage} alt="Produk" className="max-h-full max-w-full object-contain rounded" />
            </div>
          )}
        </div>
      </div>

      {/* Form Input Maklumat Produk */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Nama Produk *</label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Contoh: Dried Fruit Dunia"
            className="w-full bg-black/25 border border-white/10 rounded-[14px] p-2.5 text-xs text-[var(--text)] focus:outline-none focus:border-[#b28bff]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Kelebihan Utama *</label>
          <input
            type="text"
            value={productBenefits}
            onChange={(e) => setProductBenefits(e.target.value)}
            placeholder="Contoh: Fresh, buah tin lembut, manis semulajadi"
            className="w-full bg-black/25 border border-white/10 rounded-[14px] p-2.5 text-xs text-[var(--text)] focus:outline-none focus:border-[#b28bff]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Sasaran Pembeli (Opsional)</label>
          <input
            type="text"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder="Contoh: Peminat snek sihat & ibu-ibu"
            className="w-full bg-black/25 border border-white/10 rounded-[14px] p-2.5 text-xs text-[var(--text)] focus:outline-none focus:border-[#b28bff]"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-slate-300">Arah iklan</span>
        <div className="flex flex-wrap gap-2">
          {UGC_DIRECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDirection(item.id)}
              className={`text-xs px-3 py-1 rounded-full border ${direction === item.id ? 'bs-on' : 'border-white/10 text-slate-400'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          {UGC_DIRECTIONS.find((item) => item.id === direction)?.hint}
          {scriptData && direction !== scriptDirection
            ? ` Tekan Buat iklan sekali lagi untuk ${directionLabel(direction)}.`
            : ''}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-300">Suara presenter</span>
        <button
          type="button"
          onClick={() => setPresenterVoice('lelaki')}
          className={`text-xs px-3 py-1 rounded-full border ${presenterVoice === 'lelaki' ? 'bs-on' : 'border-white/10 text-slate-400'}`}
        >
          Lelaki
        </button>
        <button
          type="button"
          onClick={() => setPresenterVoice('perempuan')}
          className={`text-xs px-3 py-1 rounded-full border ${presenterVoice === 'perempuan' ? 'bs-on' : 'border-white/10 text-slate-400'}`}
        >
          Perempuan
        </button>
        <span className="text-[11px] text-slate-500">Lalai lelaki. Iklan yang sudah siap kekal sehingga dibuat semula.</span>
      </div>

      <button
        onClick={handleBuildAd}
        disabled={isLoading}
        className="bs-btn w-full py-3 text-xs disabled:opacity-50"
      >
        {buildLabel || 'Buat iklan'}
      </button>

      {scriptData && (
        <div className="flex flex-col gap-4 mt-2">
          <div className="bg-slate-950 p-4 border border-slate-800 rounded-xl flex flex-col gap-3">
            <h3 className="text-sm font-bold text-amber-400">{scriptData.title}</h3>
            {scriptData.scenes.map((scene) => (
              <div key={scene.sceneNumber}>
                <div className="flex justify-between items-center mb-0.5">
                  <p className="text-[11px] text-slate-400 font-medium">{scene.title}</p>
                  <button
                    type="button"
                    onClick={() => handlePlayAudio(scene.scriptMalay)}
                    className="text-[10px] bg-purple-950/60 hover:bg-purple-800 text-purple-300 border border-purple-700 px-2 py-0.5 rounded transition"
                  >
                    Dengar Suara
                  </button>
                </div>
                <p className="text-xs text-slate-200 italic bg-slate-900 p-2 rounded-lg border border-slate-800/80">"{scene.scriptMalay}"</p>
              </div>
            ))}
          </div>

          {stitchedVideo && (
            <div className="bg-slate-950 border border-emerald-500/50 p-6 rounded-2xl flex flex-col items-center gap-4">
              <h3 className="text-base font-bold text-emerald-400">Iklan siap</h3>
              <video src={stitchedVideo} controls playsInline className="w-full max-w-xs h-auto rounded-xl border border-slate-800" />
              <a
                href={stitchedVideo}
                download="iklan-ugc.mp4"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition shadow-lg"
              >
                Muat Turun Iklan (MP4)
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
