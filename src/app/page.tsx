'use client'

import { useEffect, useRef, useState } from 'react'
import UgcStoryboard from './components/UgcStoryboard'
import { listClips, saveClip } from '@/lib/clip-store'

interface HistoryItem {
  id: string
  url: string
  prompt: string
  style: string
  date: string
}

const POLL_MS = 4000
const POLL_LIMIT_MS = 8 * 60 * 1000

async function shrinkImage(file: File) {
  const bitmap = await createImageBitmap(file)
  const maxEdge = 1024
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return fileToDataUrl(file)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.82)
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString('ms-MY', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Home() {
  const [ready, setReady] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)

  const [activeTab, setActiveTab] = useState<'studio' | 'ugc'>('studio')
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [selectedStyle, setSelectedStyle] = useState('Cinematic')
  const [isGenerating, setIsGenerating] = useState(false)
  const [enhancedPrompt, setEnhancedPrompt] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [credits, setCredits] = useState(0)

  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const ownedUrls = useRef<string[]>([])
  const startedJobs = useRef<Set<string>>(new Set())
  const polls = useRef<number[]>([])

  const presets = [
    { label: '🗣️ Skrip Motivasi', text: 'Seorang penceramah berkarisma menyampaikan skrip motivasi pagi dengan pencahayaan hangat dan fokus sinematik.' },
    { label: '🌆 Bandar Cyberpunk', text: 'Pemandangan bandar futuristik cyberpunk di waktu malam dengan lampu neon berkilauan dan kenderaan terbang.' },
    { label: '📦 Tayangan Produk', text: 'Persembahan produk komersial 3D yang elegan dengan pergerakan kamera perlahan dan studio lighting profesional.' },
  ]

  const styleOptions = [
    'Cinematic',
    'Photorealistic',
    'Anime / Ghibli',
    '3D Render',
    'Cyberpunk',
    'Vintage Film',
  ]

  useEffect(() => {
    return () => {
      polls.current.forEach((id) => window.clearInterval(id))
      ownedUrls.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    let cancel = false
    fetch('/api/sesi')
      .then((res) => res.json())
      .then((data) => {
        if (cancel) return
        setConfigured(data.configured !== false)
        setReady(true)
        if (!data.ok) return
        setAuthed(true)
        setCredits(data.credits)
        ;(data.pending || []).forEach((id: string) => pollVideoStatus(id, 'Video yang belum selesai', selectedStyle))
      })
      .catch(() => {
        if (!cancel) setReady(true)
      })
    return () => {
      cancel = true
    }
    // Sesi disemak sekali bila halaman dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!authed) return
    let cancel = false
    listClips()
      .then((clips) => {
        if (cancel) return
        const items = clips.map((clip) => {
          const url = URL.createObjectURL(clip.blob)
          ownedUrls.current.push(url)
          return {
            id: clip.id,
            url,
            prompt: clip.prompt,
            style: clip.style,
            date: formatWhen(clip.createdAt),
          }
        })
        setHistory(items)
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
  }, [authed])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setImagePreview(await shrinkImage(file))
    } catch {
      setImagePreview(await fileToDataUrl(file))
    }
  }

  const removeImage = () => {
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const finishJob = async (jobId: string, hasil: 'siap' | 'gagal') => {
    const res = await fetch('/api/selesai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: jobId, hasil }),
    })
    const data = await res.json().catch(() => ({}))
    if (typeof data.credits === 'number') setCredits(data.credits)
    return data
  }

  const keepClip = async (jobId: string, remoteUrl: string, currentPrompt: string, style: string, directed: string) => {
    const fileRes = await fetch(`/api/muat-turun?id=${encodeURIComponent(jobId)}`)
    if (!fileRes.ok) {
      setVideoUrl(remoteUrl)
      setStatusMessage('Video siap. Muat turun sekarang, pautan asal akan luput.')
      return
    }
    const blob = await fileRes.blob()
    const localUrl = URL.createObjectURL(blob)
    ownedUrls.current.push(localUrl)
    setVideoUrl(localUrl)
    const createdAt = new Date().toISOString()
    try {
      await saveClip({ id: jobId, prompt: currentPrompt, style, enhancedPrompt: directed, createdAt, blob })
      setHistory((prev) => [
        { id: jobId, url: localUrl, prompt: currentPrompt, style, date: formatWhen(createdAt) },
        ...prev.filter((item) => item.id !== jobId),
      ])
      setStatusMessage('Video siap dan disimpan dalam pelayar ini.')
    } catch {
      setStatusMessage('Video siap. Simpanan pelayar gagal, muat turun sekarang.')
    }
  }

  const pollVideoStatus = (jobId: string, currentPrompt: string, style: string, directed = '') => {
    if (startedJobs.current.has(jobId)) return
    startedJobs.current.add(jobId)
    const started = Date.now()
    let misses = 0

    const stop = (timer: number) => {
      window.clearInterval(timer)
      polls.current = polls.current.filter((id) => id !== timer)
      setIsGenerating(false)
    }

    const timer = window.setInterval(async () => {
      if (Date.now() - started > POLL_LIMIT_MS) {
        stop(timer)
        await finishJob(jobId, 'gagal')
        setStatusMessage('Masa tamat. Kredit dipulangkan. Sila cuba lagi.')
        return
      }

      try {
        const res = await fetch(`/api/status?id=${encodeURIComponent(jobId)}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Status tidak dapat disemak')
        misses = 0

        if (data.status === 'succeeded') {
          stop(timer)
          const remoteUrl = Array.isArray(data.output) ? data.output[0] : data.output
          await finishJob(jobId, 'siap')
          if (typeof remoteUrl === 'string') {
            await keepClip(jobId, remoteUrl, currentPrompt, style, directed)
          } else {
            setStatusMessage('Video dilaporkan siap, tetapi failnya tidak dijumpai. Kredit kekal digunakan.')
          }
        } else if (data.status === 'failed' || data.status === 'canceled') {
          stop(timer)
          await finishJob(jobId, 'gagal')
          const reason = typeof data.error === 'string' ? data.error : 'Penjanaan video di pelayan gagal.'
          setStatusMessage(`${reason} Kredit dipulangkan.`)
        } else {
          setStatusMessage(`Status penjanaan: ${data.status}. Biasanya siap dalam 1–2 minit.`)
        }
      } catch {
        misses += 1
        if (misses >= 5) {
          stop(timer)
          await finishJob(jobId, 'gagal')
          setStatusMessage('Sambungan terputus semasa menunggu. Kredit dipulangkan.')
        }
      }
    }, POLL_MS)

    polls.current.push(timer)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginBusy(true)
    setLoginError('')
    try {
      const res = await fetch('/api/masuk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.configured === false) setConfigured(false)
        throw new Error(data.error || 'Tidak dapat masuk.')
      }
      setAuthed(true)
      setCredits(data.credits)
      setPassword('')
    } catch (err: any) {
      setLoginError(err.message)
    } finally {
      setLoginBusy(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/keluar', { method: 'POST' })
    setAuthed(false)
    setIsGenerating(false)
    setVideoUrl('')
    setStatusMessage('')
  }

  const handleGenerate = async () => {
    if (!prompt && !imagePreview) return alert('Sila masukkan prompt teks atau muat naik gambar!')
    if (credits < 1) return alert('Baki kredit tidak mencukupi.')

    setIsGenerating(true)
    setVideoUrl('')
    setEnhancedPrompt('')
    setStatusMessage('Menyusun arahan syot mengikut gaya yang dipilih...')

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          aspectRatio,
          imageUrl: imagePreview,
          style: selectedStyle,
        }),
      })
      const data = await res.json()
      if (typeof data.credits === 'number') setCredits(data.credits)
      if (!res.ok) throw new Error(data.error || 'Gagal memproses tugasan')

      setEnhancedPrompt(data.enhancedPrompt || '')
      setStatusMessage('Tugasan dihantar. Video sedang dijana...')
      pollVideoStatus(data.jobId, prompt || 'Animasi gambar', selectedStyle, data.enhancedPrompt || '')
    } catch (err: any) {
      setStatusMessage(err.message || 'Penjanaan gagal.')
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
        {authed && (
          <div className="flex items-center gap-3">
            <div className="border border-white/10 bg-white/5 px-4 py-1.5 rounded-full text-sm flex items-center gap-2">
              <span className="text-[var(--muted)]">Kredit</span>
              <span className="font-bold">{credits}</span>
            </div>
            <button
              type="button"
              onClick={() => alert('Top Up belum dibuka. Kredit sesi log masuk ini bermula pada 2.')}
              className="bs-ghost px-4 py-1.5 text-sm font-semibold"
            >
              Top Up
            </button>
            <button type="button" onClick={handleLogout} className="bs-ghost px-4 py-1.5 text-sm font-semibold">
              Keluar
            </button>
          </div>
        )}
      </header>

      {!ready ? (
        <main className="flex-1 max-w-xl w-full mx-auto p-6">
          <section className="bs-panel p-8 pt-9">
            <p className="text-sm text-[var(--muted)]">Menyemak pintu studio...</p>
          </section>
        </main>
      ) : !authed ? (
        <main className="flex-1 max-w-xl w-full mx-auto p-6">
          <form onSubmit={handleLogin} className="bs-panel p-8 pt-9 flex flex-col gap-4">
            <div>
              <h1 className="text-2xl font-bold bs-title">Masuk Studio</h1>
              <p className="text-sm text-[var(--muted)] mt-2">
                Pintu ini dikunci supaya pelawat laman utama tidak menggunakan baki penjanaan video.
              </p>
            </div>
            {!configured && (
              <p className="text-sm text-[#efe7ff] bg-white/5 border border-white/10 rounded-[14px] p-3">
                Kata laluan belum ditetapkan pada pelayan. Dalam Vercel, tambah pembolehubah
                BESHARE_VIDEO_PASSWORD, kemudian deploy semula.
              </p>
            )}
            <label className="flex flex-col gap-2 text-sm">
              Kata laluan
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full bg-black/25 border border-white/10 rounded-[14px] p-3 text-sm focus:outline-none focus:border-[#b28bff]"
              />
            </label>
            {loginError && <p className="text-sm text-red-300">{loginError}</p>}
            <button type="submit" disabled={loginBusy || !configured} className="bs-btn py-3 text-sm disabled:opacity-50">
              {loginBusy ? 'Memeriksa...' : 'Masuk'}
            </button>
          </form>
        </main>
      ) : (
        <>
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
                <div className="lg:col-span-5 bs-panel p-6 pt-7 flex flex-col gap-5">
                  <div>
                    <h2 className="text-lg font-semibold mb-1 bs-title">Jana Video AI</h2>
                    <p className="text-xs text-slate-400">Tukar idea teks atau gambar anda menjadi video sinematik.</p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-purple-400">💡 Templat Prompt Pantas</label>
                    <div className="flex flex-wrap gap-2">
                      {presets.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setPrompt(preset.text)}
                          className="bs-ghost text-[11px] text-[var(--muted)] px-2.5 py-1"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

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

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-300">Prompt Teks</label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Contoh: Seekor kucing angkasa lepas..."
                      className="w-full h-20 bg-black/25 border border-white/10 rounded-[14px] p-3 text-sm focus:outline-none focus:border-[#b28bff] transition resize-none placeholder:text-[var(--muted)]"
                    />
                  </div>

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
                    <p className="text-[10px] text-slate-500">Gaya ini dimasukkan ke dalam arahan video.</p>
                  </div>

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

                  <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                    <p className="text-xs font-semibold text-slate-200">Klip senyap</p>
                    <p className="text-[10px] text-slate-500">Model studio ini menghasilkan video tanpa bunyi. Suara dan muzik datang kemudian.</p>
                  </div>

                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="bs-btn w-full py-3 text-sm mt-1 disabled:opacity-50"
                  >
                    {isGenerating ? 'Sedang Diproses...' : 'Jana Video (1 Kredit)'}
                  </button>
                </div>

                <div className="lg:col-span-7 bs-panel p-6 pt-7 flex flex-col gap-4">
                  <h2 className="text-lg font-semibold bs-title">Hasil & Status Penjanaan</h2>

                  {statusMessage && (
                    <div className="p-3.5 bg-slate-950 border border-purple-500/30 rounded-xl text-xs text-purple-300">
                      {statusMessage}
                    </div>
                  )}

                  {enhancedPrompt && (
                    <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex flex-col gap-1">
                      <span className="text-xs font-semibold text-amber-400">Arahan syot ({selectedStyle}):</span>
                      <p className="text-xs text-slate-300 italic">&quot;{enhancedPrompt}&quot;</p>
                    </div>
                  )}

                  <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl flex flex-col items-center justify-center overflow-hidden relative min-h-[280px]">
                    {videoUrl ? (
                      <div className="w-full h-full flex flex-col items-center justify-center p-2 gap-3">
                        <video src={videoUrl} controls autoPlay loop className="w-full max-h-[380px] object-contain rounded-lg" />
                        <a
                          href={videoUrl}
                          download="beshare-video.mp4"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-950/40"
                        >
                          Muat Turun Video MP4
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

          {history.length > 0 && activeTab === 'studio' && (
            <section className="max-w-7xl w-full mx-auto px-6 mt-6">
              <h3 className="text-base font-bold text-slate-200 mb-4 flex items-center gap-2">
                <span>🎞️</span> Video disimpan dalam pelayar ini ({history.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {history.map((item) => (
                  <div key={item.id} className="bs-panel p-3 pt-4 flex flex-col gap-2">
                    <video src={item.url} controls className="w-full h-36 object-cover rounded-lg bg-slate-950" />
                    <div className="flex justify-between items-center text-[10px] text-purple-400 font-semibold">
                      <span>Gaya: {item.style}</span>
                      <span className="text-slate-500">{item.date}</span>
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-2 italic">&quot;{item.prompt}&quot;</p>
                    <a
                      href={item.url}
                      download="beshare-video.mp4"
                      className="mt-auto text-center text-xs bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 py-1.5 rounded-lg transition"
                    >
                      Muat Turun
                    </a>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
