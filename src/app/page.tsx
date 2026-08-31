'use client'

import { useState, useRef } from 'react'

export default function Home() {
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [isGenerating, setIsGenerating] = useState(false)
  const [enhancedPrompt, setEnhancedPrompt] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [credits, setCredits] = useState(2)

  // Ciri baharu: Tetapan Gambar & Audio
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [enableAudio, setEnableAudio] = useState(true)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Pengendali muat naik gambar
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // Pengendali buang gambar
  const removeImage = () => {
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Fungsi menyemak status pemprosesan video dari Replicate
  const pollVideoStatus = async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/status?id=${jobId}`)
        const data = await res.json()

        if (data.status === 'succeeded') {
          clearInterval(interval)
          const url = Array.isArray(data.output) ? data.output[0] : data.output
          setVideoUrl(url)
          setStatusMessage('🎉 Video anda telah siap sepenuhnya!')
          setIsGenerating(false)
        } else if (data.status === 'failed') {
          clearInterval(interval)
          setStatusMessage('❌ Penjanaan video di pelayan gagal.')
          setIsGenerating(false)
        } else {
          setStatusMessage(`🔄 Status Penjanaan: ${data.status}... (Sila tunggu 1-2 minit)`)
        }
      } catch (err) {
        console.error('Ralat menyemak status:', err)
      }
    }, 4000)
  }

  const handleGenerate = async () => {
    if (!prompt && !imagePreview) return alert('Sila masukkan prompt teks atau muat naik gambar!')
    if (credits < 1) return alert('Baki kredit tidak mencukupi!')

    setIsGenerating(true)
    setVideoUrl('')
    setStatusMessage('🧠 Gemini sedang mengoptimumkan prompt & tetapan...')

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          aspectRatio,
          imageUrl: imagePreview,
          enableAudio,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal memproses tugasan')

      setEnhancedPrompt(data.enhancedPrompt)
      setCredits((prev) => prev - 1)
      setStatusMessage('🎬 Tugasan dihantar! Menunggu video & audio diproses...')

      pollVideoStatus(data.jobId)
    } catch (err: any) {
      alert(`Ralat: ${err.message}`)
      setStatusMessage('❌ Penjanaan gagal.')
      setIsGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎬</span>
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
            AI Video Studio
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 border border-slate-800 px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2">
            <span>🪙 Baki Kredit:</span>
            <span className="text-amber-400 font-bold">{credits}</span>
          </div>
          <button className="bg-purple-600 hover:bg-purple-500 px-4 py-1.5 rounded-lg text-sm font-semibold transition">
            Top Up
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-5">
          <div>
            <h2 className="text-lg font-semibold mb-1">Jana Video AI</h2>
            <p className="text-xs text-slate-400">Tukar idea teks atau gambar anda menjadi video sinematik.</p>
          </div>

          {/* Ruangan Muat Naik Gambar (Image-to-Video) */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300 flex items-center justify-between">
              <span>Gambar Sumber (Pilihan - Image to Video)</span>
              {imagePreview && (
                <button
                  type="button"
                  onClick={removeImage}
                  className="text-xs text-red-400 hover:underline"
                >
                  Padam Gambar
                </button>
              )}
            </label>
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageUpload}
              className="hidden"
            />

            {!imagePreview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-slate-800 hover:border-purple-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition bg-slate-950 hover:bg-slate-950/80 text-center"
              >
                <span className="text-xl mb-1">🖼️</span>
                <p className="text-xs text-slate-400">Klik untuk muat naik gambar rujukan</p>
                <p className="text-[10px] text-slate-600 mt-0.5">PNG, JPG atau WEBP</p>
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden border border-purple-500/50 group max-h-40 flex items-center justify-center bg-slate-950">
                <img src={imagePreview} alt="Preview" className="w-full h-36 object-cover" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 bg-slate-950/80 hover:bg-red-600 text-white p-1.5 rounded-full text-xs transition"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Prompt Teks */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300">Prompt Teks</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Contoh: Seekor kucing angkasa lepas..."
              className="w-full h-24 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-purple-500 transition resize-none placeholder:text-slate-600"
            />
          </div>

          {/* Nisbah Paparan */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300">Nisbah Paparan (Aspect Ratio)</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '16:9 (YouTube)', value: '16:9' },
                { label: '9:16 (TikTok/Reels)', value: '9:16' },
                { label: '1:1 (Square)', value: '1:1' },
              ].map((ratio) => (
                <button
                  key={ratio.value}
                  type="button"
                  onClick={() => setAspectRatio(ratio.value)}
                  className={`py-2 px-3 text-xs rounded-lg border font-medium transition ${
                    aspectRatio === ratio.value
                      ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {ratio.label}
                </button>
              ))}
            </div>
          </div>

          {/* Suis Audio AI */}
          <div className="flex items-center justify-between bg-slate-950 border border-slate-800 p-3.5 rounded-xl">
            <div className="flex items-center gap-3">
              <span className="text-base">🔊</span>
              <div>
                <p className="text-xs font-semibold text-slate-200">Jana Audio & SFX AI</p>
                <p className="text-[10px] text-slate-500">Kesan bunyi & muzik latar automatik</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={enableAudio}
              onChange={(e) => setEnableAudio(e.target.checked)}
              className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 font-semibold rounded-xl transition shadow-lg shadow-purple-900/20 disabled:opacity-50 text-sm mt-2"
          >
            {isGenerating ? '🔄 Sedang Diproses...' : '🎬 Jana Video (1 Kredit)'}
          </button>
        </div>

        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Hasil & Status Penjanaan</h2>

          {statusMessage && (
            <div className="p-4 bg-slate-950 border border-purple-500/30 rounded-xl text-xs text-purple-300">
              {statusMessage}
            </div>
          )}

          {enhancedPrompt && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex flex-col gap-1">
              <span className="text-xs font-semibold text-amber-400">✨ Prompt Dioptimumkan:</span>
              <p className="text-xs text-slate-300 italic">"{enhancedPrompt}"</p>
            </div>
          )}

          <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl flex flex-col items-center justify-center overflow-hidden relative min-h-[300px]">
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                autoPlay
                loop
                className="w-full h-full object-contain rounded-xl"
              />
            ) : (
              <div className="p-8 text-center">
                <span className="text-4xl block mb-3">📹</span>
                <p className="text-sm text-slate-400 max-w-sm">
                  Video yang siap dijana akan dipaparkan dan dimainkan secara automatik di sini.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
