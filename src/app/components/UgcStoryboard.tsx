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

interface SceneState {
  isGenerating: boolean
  status: string
  url: string
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
  const [customAudios, setCustomAudios] = useState<{ [key: number]: string }>({})

  const avatarInputRef = useRef<HTMLInputElement>(null)
  const productInputRef = useRef<HTMLInputElement>(null)

  const [sceneStates, setSceneStates] = useState<{ [key: number]: SceneState }>({})
  const [stitchedVideo, setStitchedVideo] = useState('')
  const [isStitching, setIsStitching] = useState(false)
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

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>, sceneNumber: number) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setCustomAudios((prev) => ({ ...prev, [sceneNumber]: reader.result as string }))
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
          setSceneStates((prev) => ({
            ...prev,
            [scene.sceneNumber]: { isGenerating: false, status: 'Masa tamat', url: '' },
          }))
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
            setSceneStates((prev) => ({
              ...prev,
              [scene.sceneNumber]: { isGenerating: false, status: 'Siap', url },
            }))
            resolve(url)
          } else if (data.status === 'failed' || data.status === 'canceled') {
            clearInterval(interval)
            if (scene.type === 'avatar' && !sandaran && data.busy) {
              setSceneStates((prev) => ({
                ...prev,
                [scene.sceneNumber]: { isGenerating: true, status: 'Cara licin sibuk, mencuba cara lama...', url: '' },
              }))
              requestScene(scene, true, spoken).then(resolve, reject)
              return
            }
            const errorMsg = data.error || 'Penjanaan video gagal di pelayan AI.'
            setSceneStates((prev) => ({
              ...prev,
              [scene.sceneNumber]: { isGenerating: false, status: 'Gagal', url: '' },
            }))
            reject(new Error(errorMsg))
          } else {
            setSceneStates((prev) => ({
              ...prev,
              [scene.sceneNumber]: { ...prev[scene.sceneNumber], status: `${data.status}...` },
            }))
          }
        } catch (err) {
          misses += 1
          if (misses >= 5) {
            clearInterval(interval)
            console.error('Ralat status adegan:', err)
            setSceneStates((prev) => ({
              ...prev,
              [scene.sceneNumber]: { isGenerating: false, status: 'Sambungan terputus', url: '' },
            }))
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

    setSceneStates((prev) => ({
      ...prev,
      [scene.sceneNumber]: { isGenerating: true, status: 'Menyusun scene...', url: '' },
    }))

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: scene.visualPrompt,
        aspectRatio: '9:16',
        imageUrl: selectedImage,
        type: scene.type,
        scriptMalay: scene.scriptMalay,
        customAudio: customAudios[scene.sceneNumber] || null,
        voice: presenterVoice,
        direction: spoken,
        motion: sandaran ? 'sandaran' : undefined,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setSceneStates((prev) => ({
        ...prev,
        [scene.sceneNumber]: { isGenerating: false, status: '❌ Ralat', url: '' },
      }))
      throw new Error(data.error || 'Gagal memproses adegan')
    }
    setSceneStates((prev) => ({
      ...prev,
      [scene.sceneNumber]: { ...prev[scene.sceneNumber], status: '🎬 Diproses...' },
    }))
    return waitForJob(data.jobId, scene, sandaran, spoken)
  }

  const handleGenerateSceneVideo = async (scene: Scene) => {
    try {
      await requestScene(scene)
    } catch (err: any) {
      alert(`Ralat adegan ${scene.sceneNumber}: ${err.message}`)
    }
  }

  const stitchClips = async (clips: { url: string; scriptMalay: string; type: string }[]) => {
    if (clips.length < 2) return
    setIsStitching(true)
    try {
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
      setStitchedVideo(URL.createObjectURL(videoBlob))
    } catch (err: any) {
      alert(`Ralat cantum video: ${err.message}`)
    } finally {
      setIsStitching(false)
    }
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
    setSceneStates({})
    setStitchedVideo('')
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
      for (let index = 0; index < board.scenes.length; index += 1) {
        const scene = board.scenes[index]
        setBuildLabel(`Adegan ${index + 1} daripada ${board.scenes.length}`)
        try {
          const url = await requestScene(scene, false, direction)
          ready.push({ url, scriptMalay: scene.scriptMalay, type: scene.type })
        } catch (err: any) {
          alert(`Ralat adegan ${scene.sceneNumber}: ${err.message}`)
        }
      }

      if (ready.length >= 2) {
        setBuildLabel('Mencantumkan iklan...')
        await stitchClips(ready)
      }
    } catch (err: any) {
      alert(`Ralat: ${err.message}`)
    } finally {
      setBuildLabel('')
      setIsLoading(false)
    }
  }

  const handleStitchVideos = async () => {
    if (!scriptData) return

    const sceneDataToSend = scriptData.scenes
      .map((scene) => ({
        url: sceneStates[scene.sceneNumber]?.url,
        scriptMalay: scene.scriptMalay,
        type: scene.type,
      }))
      .filter((s) => s.url)

    if (sceneDataToSend.length < 2) {
      return alert('Sila jana sekurang-kurangnya 2 adegan sebelum mencantumkan video!')
    }

    setIsStitching(true)
    try {
      const res = await fetch('/api/stitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes: sceneDataToSend, voice: presenterVoice }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Gagal mencantumkan video')
      }

      // Terima respon binary sebagai Blob URL terus untuk elak ralat saiz Base64
      const videoBlob = await res.blob()
      const objectUrl = URL.createObjectURL(videoBlob)
      setStitchedVideo(objectUrl)
    } catch (err: any) {
      alert(`Ralat cantum video: ${err.message}`)
    } finally {
      setIsStitching(false)
    }
  }

  const completedCount = Object.values(sceneStates).filter((s) => s.url).length

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
            ? ` Skrip semasa ialah ${directionLabel(scriptDirection)}. Jana skrip semula untuk arah ini.`
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
        <span className="text-[11px] text-slate-500">Lalai lelaki. Klip yang sudah siap kekal sehingga dijana semula.</span>
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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-950 p-4 border border-slate-800 rounded-xl gap-3">
            <div>
              <h3 className="text-sm font-bold text-amber-400">📋 {scriptData.title}</h3>
              <p className="text-[11px] text-slate-400">
                {buildLabel || `${completedCount}/4 adegan sedia.`} Angka kredit di atas untuk tab Studio.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {completedCount >= 2 && (
                <button
                  onClick={handleStitchVideos}
                  disabled={isStitching || isLoading}
                  className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition shadow-lg disabled:opacity-50"
                >
                  {isStitching ? 'Mencantumkan...' : 'Cantumkan semula'}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scriptData.scenes.map((scene) => {
              const state = sceneStates[scene.sceneNumber] || { isGenerating: false, status: '', url: '' }

              return (
                <div key={scene.sceneNumber} className="bg-black/20 border border-white/10 rounded-[14px] p-4 flex flex-col gap-3 justify-between">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-purple-400">{scene.title}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${scene.type === 'avatar' ? 'bg-purple-950 text-purple-300 border border-purple-800' : 'bg-blue-950 text-blue-300 border border-blue-800'}`}>
                        {scene.type === 'avatar' ? '🗣️ Avatar' : '📹 B-Roll'}
                      </span>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-0.5">
                        <p className="text-[11px] text-slate-400 font-medium">Skrip Audio (BM):</p>
                        <button
                          type="button"
                          onClick={() => handlePlayAudio(scene.scriptMalay)}
                          className="text-[10px] bg-purple-950/60 hover:bg-purple-800 text-purple-300 border border-purple-700 px-2 py-0.5 rounded transition flex items-center gap-1"
                        >
                          🔊 Dengar Suara
                        </button>
                      </div>
                      <p className="text-xs text-slate-200 italic bg-slate-900 p-2 rounded-lg border border-slate-800/80">"{scene.scriptMalay}"</p>
                    </div>

                    {scene.type === 'avatar' && (
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-semibold text-emerald-400">🎙️ Suara Sendiri (Opsional):</span>
                          {customAudios[scene.sceneNumber] && (
                            <button
                              onClick={() => setCustomAudios((prev) => { const n = { ...prev }; delete n[scene.sceneNumber]; return n })}
                              className="text-[10px] text-red-400 hover:underline"
                            >
                              Padam Audio
                            </button>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={(e) => handleAudioUpload(e, scene.sceneNumber)}
                          className="text-[11px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:bg-emerald-950 file:text-emerald-300 hover:file:bg-emerald-800 cursor-pointer"
                        />
                      </div>
                    )}

                    <div>
                      <p className="text-[11px] text-slate-400 font-medium mb-0.5">Prompt Visual (AI Video):</p>
                      <p className="text-[11px] text-slate-400 bg-slate-900 p-2 rounded-lg border border-slate-800/80">{scene.visualPrompt}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-col gap-2">
                    {state.url ? (
                      <div className="flex flex-col gap-2">
                        <video
                          src={state.url}
                          controls
                          className="w-full aspect-[9/16] max-h-80 object-contain rounded-lg bg-black"
                        />
                        <a
                          href={state.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={`scene-${scene.sceneNumber}.mp4`}
                          className="text-center text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded-lg transition"
                        >
                          📥 Muat Turun Klip MP4
                        </a>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGenerateSceneVideo(scene)}
                        disabled={state.isGenerating}
                        className="w-full py-2 bg-slate-800 hover:bg-purple-600 text-slate-200 font-semibold rounded-lg text-xs transition border border-slate-700 disabled:opacity-50"
                      >
                        {state.isGenerating ? state.status : `Jana Klip Adegan ${scene.sceneNumber}`}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {stitchedVideo && (
            <div className="bg-slate-950 border border-emerald-500/50 p-6 rounded-2xl flex flex-col items-center gap-4 mt-4">
              <h3 className="text-base font-bold text-emerald-400">🎉 Video Iklan UGC Lengkap (Siap Dicantum Dengan Audio)</h3>
              <video src={stitchedVideo} controls autoPlay className="w-full max-w-xs h-auto rounded-xl border border-slate-800" />
              <a
                href={stitchedVideo}
                download="iklan-ugc-full.mp4"
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition shadow-lg"
              >
                📥 Muat Turun Video Iklan Penuh (MP4)
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
