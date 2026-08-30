'use client'

import { useState } from 'react'

export default function Home() {
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [isGenerating, setIsGenerating] = useState(false)
  const [enhancedPrompt, setEnhancedPrompt] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [credits, setCredits] = useState(2)

  // Fungsi menyemak status pemprosesan video dari Replicate
  const pollVideoStatus = async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/status?id=${jobId}`)
        const data = await res.json()

        if (data.status === 'succeeded') {
          clearInterval(interval)
          // Mengambil URL video hasil render
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
    }, 4000) // Semak setiap 4 saat
  }

  const handleGenerate = async () => {
    if (!prompt) return alert('Sila masukkan prompt teks dahulu!')
    if (credits < 1) return alert('Baki kredit tidak mencukupi!')

    setIsGenerating(true)
    setVideoUrl('')
    setStatusMessage('🧠 Gemini sedang mengoptimumkan prompt anda...')

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, aspectRatio }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal memproses tugasan')

      setEnhancedPrompt(data.enhancedPrompt)
      setCredits((prev) => prev - 1)
      setStatusMessage('🎬 Tugasan dihantar! Menunggu video diproses...')

      // Mula menyemak status tugasan secara automatik
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
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Jana Video AI</h2>
            <p className="text-xs text-slate-400">Tukar idea teks anda menjadi video sinematik.</p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300">Prompt Teks</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Contoh: Seekor kucing angkasa lepas..."
              className="w-full h-32 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-purple-500 transition resize-none placeholder:text-slate-600"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300">Nisbah Paparan (Aspect Ratio)</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '16:9 (YouTube)', value: '16:9' },
                { label: '9:16 (TikTok/Reels)', value: '9:16' },
                { label: '1:1 (Square)', value: '1:1' }
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

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 font-semibold rounded-xl transition shadow-lg shadow-purple-900/20 disabled:opacity-50 text-sm mt-auto"
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