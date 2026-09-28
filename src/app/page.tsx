'use client'

import { useState, useRef } from 'react'
import UgcStoryboard from './components/UgcStoryboard'

interface HistoryItem {
  id: string
  url: string
  prompt: string
  style: string
  date: string
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'studio' | 'ugc'>('studio')
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [selectedStyle, setSelectedStyle] = useState('Cinematic')
  const [isGenerating, setIsGenerating] = useState(false)
  const [enhancedPrompt, setEnhancedPrompt] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [credits, setCredits] = useState(2)

  // Tetapan Gambar & Audio
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [enableAudio, setEnableAudio] = useState(true)

  // Sejarah Video (History)
  const [history, setHistory] = useState<HistoryItem[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Templat Prompt Pantas
  const presets = [
    { label: '🗣️ Skrip Motivasi', text: 'Seorang penceramah berkarisma menyampaikan skrip motivasi pagi dengan pencahayaan hangat dan fokus sinematik.' },
    { label: '🌆 Bandar Cyberpunk', text: 'Pemandangan bandar futuristik cyberpunk di waktu malam dengan lampu neon berkilauan dan kenderaan terbang.' },
    { label: '📦 Tayangan Produk', text: 'Persembahan produk komersial 3D yang elegan dengan pergerakan kamera perlahan dan studio lighting profesional.' },
  ]

  // Pilihan Gaya Visual
  const styleOptions = [
    'Cinematic',
    'Photorealistic',
    'Anime / Ghibli',
    '3D Render',
    'Cyberpunk',
    'Vintage Film',
  ]

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setImagePreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const removeImage = () => {
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const pollVideoStatus = async (jobId: string, currentPrompt: string) => {
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

          const newItem: HistoryItem = {
            id: jobId,
            url,
            prompt: currentPrompt,
            style: selectedStyle,
            date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }
          setHistory((prev) => [newItem, ...prev])

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
          style: selectedStyle,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal memproses tugasan')

      setEnhancedPrompt(data.enhancedPrompt)
      setCredits((prev) => prev - 1)
      setStatusMessage('🎬 Tugasan dihantar! Menunggu video & audio diproses...')

      pollVideoStatus(data.jobId, prompt || 'Image Animation')
    } catch (err: any) {
      alert(`Ralat: ${err.message}`)
      setStatusMessage('❌ Penjanaan gagal.')
      setIsGenerating(false)
    }
  }

  return (
    <div className="min-h-screen text-[var(--text)] flex flex-col pb-12">
      <header className="max-w-7xl w-full mx-auto px-6 py-5 flex items-center justify-between gap-4">
        <a href="https://beshareaisolution.com" className="flex items-center gap-2 text-[var(--text)] no-underline">
          <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true">
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#7c9cff" />
                <stop offset="1" stopColor="#b28bff" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="8" fill="#131734" />
            <path d="M8 9h16l-8 15z" fill="url(#g)" />
          </svg>
          <span className="text-lg font-bold">BeShare <span className="text-[var(--muted)] font-semibold">AI Solution</span></span>
        </a>
        <div className="flex items-center gap-3">
          <div className="border border-white/10 bg-white/5 px-4 py-1.5 rounded-full text-sm flex items-center gap-2">
            <span className="text-[var(--muted)]">Kredit</span>
            <span className="font-bold">{credits}</span>
          </div>
          <button className="bs-ghost px-4 py-1.5 text-sm font-semibold">Top Up</button>
        </div>
      </header>

      {/* Navigasi Tab */}
      <div className="max-w-7xl w-full mx-auto px-6 pt-6 flex gap-3">
        <button
          onClick={() => setActiveTab('studio')}
          className={`px-4 py-2 text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'studio' ? 'bs-btn' : 'bs-ghost text-[var(--muted)]'
          }`}
        >
          <span>🎬</span> Studio Video AI
        </button>
        <button
          onClick={() => setActiveTab('ugc')}
          className={`px-4 py-2 text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'ugc' ? 'bs-btn' : 'bs-ghost text-[var(--muted)]'
          }`}
        >
          <span>✨</span> UGC Ad Creator (TikTok/Reels)
        </button>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {activeTab === 'ugc' ? (
          <UgcStoryboard />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Panel Kiri: Input & Tetapan */}
            <div className="lg:col-span-5 bs-panel p-6 pt-7 flex flex-col gap-5">
              <div>
                <h2 className="text-lg font-semibold mb-1 bs-title">Jana Video AI</h2>
                <p className="text-xs text-slate-400">Tukar idea teks atau gambar anda menjadi video sinematik.</p>
              </div>

              {/* Templat Prompt Pantas */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-purple-400">💡 Templat Prompt Pantas</label>
                <div className="flex flex-wrap gap-2">
                  {presets.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPrompt(preset.text)}
                      className="bs-ghost text-[11px] text-[var(--muted)] px-2.5 py-1"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Muat Naik Gambar */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-300 flex items-center justify-between">
                  <span>Gambar Sumber (Image-to-Video)</span>
                  {imagePreview && (
                    <button type="button" onClick={removeImage} className="text-xs text-red-400 hover:underline">
                      Padam Gambar
                    </button>
                  )}
                </label>
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />

                {!imagePreview ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-slate-800 hover:border-purple-500 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer transition bg-slate-950 hover:bg-slate-950/80 text-center"
                  >
                    <span className="text-lg mb-0.5">🖼️</span>
                    <p className="text-xs text-slate-400">Klik untuk muat naik gambar rujukan</p>
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border border-purple-500/50 max-h-36 flex items-center justify-center bg-slate-950">
                    <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover" />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute top-2 right-2 bg-slate-950/80 hover:bg-red-600 text-white p-1 rounded-full text-xs transition"
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
                  className="w-full h-20 bg-black/25 border border-white/10 rounded-[14px] p-3 text-sm focus:outline-none focus:border-[#b28bff] transition resize-none placeholder:text-[var(--muted)]"
                />
              </div>

              {/* Pilihan Gaya Visual */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-300">Gaya Visual (Style)</label>
                <div className="grid grid-cols-3 gap-2">
                  {styleOptions.map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setSelectedStyle(style)}
                      className={`py-1.5 px-2 text-[11px] rounded-lg border font-medium transition ${
                        selectedStyle === style
                          ? 'bs-on'
                          : 'bg-black/25 border-white/10 text-[var(--muted)]'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nisbah Paparan */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-300">Nisbah Paparan (Aspect Ratio)</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '16:9', value: '16:9' },
                    { label: '9:16', value: '9:16' },
                    { label: '1:1', value: '1:1' },
                  ].map((ratio) => (
                    <button
                      key={ratio.value}
                      type="button"
                      onClick={() => setAspectRatio(ratio.value)}
                      className={`py-1.5 px-2 text-xs rounded-lg border font-medium transition ${
                        aspectRatio === ratio.value
                          ? 'bs-on'
                          : 'bg-black/25 border-white/10 text-[var(--muted)]'
                      }`}
                    >
                      {ratio.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Suis Audio */}
              <div className="flex items-center justify-between bg-slate-950 border border-slate-800 p-3 rounded-xl">
                <div className="flex items-center gap-2.5">
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
                className="bs-btn w-full py-3 text-sm mt-1 disabled:opacity-50"
              >
                {isGenerating ? '🔄 Sedang Diproses...' : '🎬 Jana Video (1 Kredit)'}
              </button>
            </div>

            {/* Panel Kanan: Hasil & Butang Muat Turun */}
            <div className="lg:col-span-7 bs-panel p-6 pt-7 flex flex-col gap-4">
              <h2 className="text-lg font-semibold bs-title">Hasil & Status Penjanaan</h2>

              {statusMessage && (
                <div className="p-3.5 bg-slate-950 border border-purple-500/30 rounded-xl text-xs text-purple-300">
                  {statusMessage}
                </div>
              )}

              {enhancedPrompt && (
                <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex flex-col gap-1">
                  <span className="text-xs font-semibold text-amber-400">✨ Prompt Dioptimumkan ({selectedStyle}):</span>
                  <p className="text-xs text-slate-300 italic">"{enhancedPrompt}"</p>
                </div>
              )}

              <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl flex flex-col items-center justify-center overflow-hidden relative min-h-[280px]">
                {videoUrl ? (
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 gap-3">
                    <video src={videoUrl} controls autoPlay loop className="w-full max-h-[380px] object-contain rounded-lg" />
                    <a
                      href={videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download="beshare-ai-video.mp4"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-950/40"
                    >
                      📥 Muat Turun Video MP4
                    </a>
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <span className="text-4xl block mb-3 opacity-40">📹</span>
                    <p className="text-sm text-slate-400 max-w-sm">
                      Video yang siap dijana akan dipaparkan dan dimainkan secara automatik di sini.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Sejarah Video Janaan */}
      {history.length > 0 && (
        <section className="max-w-7xl w-full mx-auto px-6 mt-6">
          <h3 className="text-base font-bold text-slate-200 mb-4 flex items-center gap-2">
            <span>🎞️</span> Sejarah Video Janaan Sesi Ini ({history.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {history.map((item) => (
              <div key={item.id} className="bs-panel p-3 pt-4 flex flex-col gap-2">
                <video src={item.url} controls className="w-full h-36 object-cover rounded-lg bg-slate-950" />
                <div className="flex justify-between items-center text-[10px] text-purple-400 font-semibold">
                  <span>Gaya: {item.style}</span>
                  <span className="text-slate-500">{item.date}</span>
                </div>
                <p className="text-xs text-slate-300 line-clamp-2 italic">"{item.prompt}"</p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto text-center text-xs bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 py-1.5 rounded-lg transition"
                >
                  📥 Muat Turun
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
