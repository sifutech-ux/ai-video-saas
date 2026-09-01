'use client'

import { useState } from 'react'

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
  const [scriptData, setScriptData] = useState<ScriptData | null>(null)

  // Rekod status penjanaan video bagi setiap adegan (Scene 1-4)
  const [sceneStates, setSceneStates] = useState<{ [key: number]: SceneState }>({})

  const handleGenerateScript = async () => {
    if (!productName || !productBenefits) {
      return alert('Sila masukkan Nama Produk dan Kelebihan Utama!')
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName, productBenefits, targetAudience }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menjana skrip')

      setScriptData(data.data)
    } catch (err: any) {
      alert(`Ralat: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const pollSceneStatus = async (jobId: string, sceneNumber: number) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/status?id=${jobId}`)
        const data = await res.json()

        if (data.status === 'succeeded') {
          clearInterval(interval)
          const url = Array.isArray(data.output) ? data.output[0] : data.output
          setSceneStates((prev) => ({
            ...prev,
            [sceneNumber]: { isGenerating: false, status: '🎉 Siap!', url },
          }))
        } else if (data.status === 'failed') {
          clearInterval(interval)
          setSceneStates((prev) => ({
            ...prev,
            [sceneNumber]: { isGenerating: false, status: '❌ Gagal', url: '' },
          }))
        } else {
          setSceneStates((prev) => ({
            ...prev,
            [sceneNumber]: { ...prev[sceneNumber], status: `🔄 ${data.status}...` },
          }))
        }
      } catch (err) {
        console.error('Ralat status adegan:', err)
      }
    }, 4000)
  }

  const handleGenerateSceneVideo = async (scene: Scene) => {
    setSceneStates((prev) => ({
      ...prev,
      [scene.sceneNumber]: { isGenerating: true, status: '🧠 Menghantar ke AI...', url: '' },
    }))

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${scene.visualPrompt}. Voice dialogue audio: ${scene.scriptMalay}`,
          aspectRatio: '9:16', // Format menegak khas TikTok/Reels
          enableAudio: true,
          style: 'Photorealistic',
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal memproses adegan')

      setSceneStates((prev) => ({
        ...prev,
        [scene.sceneNumber]: { ...prev[scene.sceneNumber], status: '🎬 Diproses...' },
      }))

      pollSceneStatus(data.jobId, scene.sceneNumber)
    } catch (err: any) {
      alert(`Ralat adegan ${scene.sceneNumber}: ${err.message}`)
      setSceneStates((prev) => ({
        ...prev,
        [scene.sceneNumber]: { isGenerating: false, status: '❌ Ralat', url: '' },
      }))
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 text-slate-100">
      <div>
        <h2 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
          ✨ UGC Script & Storyboard Generator
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Bina skrip iklan TikTok/Reels 4-adegan & jana klip video berasingan secara automatik.
        </p>
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
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Kelebihan Utama *</label>
          <input
            type="text"
            value={productBenefits}
            onChange={(e) => setProductBenefits(e.target.value)}
            placeholder="Contoh: Fresh, buah tin lembut, manis semulajadi"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Sasaran Pembeli (Opsional)</label>
          <input
            type="text"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder="Contoh: Peminat snek sihat & ibu-ibu"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      <button
        onClick={handleGenerateScript}
        disabled={isLoading}
        className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 font-semibold rounded-xl text-xs transition shadow-lg disabled:opacity-50"
      >
        {isLoading ? '🧠 Gemini sedang menulis skrip UGC...' : '📝 Jana Skrip & Papan Cerita 4-Adegan'}
      </button>

      {/* Paparan Storyboard 4-Adegan */}
      {scriptData && (
        <div className="flex flex-col gap-4 mt-2">
          <h3 className="text-sm font-bold text-amber-400">📋 {scriptData.title}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scriptData.scenes.map((scene) => {
              const state = sceneStates[scene.sceneNumber] || { isGenerating: false, status: '', url: '' }

              return (
                <div key={scene.sceneNumber} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 justify-between">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-purple-400">{scene.title}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${scene.type === 'avatar' ? 'bg-purple-950 text-purple-300 border border-purple-800' : 'bg-blue-950 text-blue-300 border border-blue-800'}`}>
                        {scene.type === 'avatar' ? '🗣️ Avatar' : '📹 B-Roll'}
                      </span>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 font-medium mb-0.5">Skrip Audio (BM):</p>
                      <p className="text-xs text-slate-200 italic bg-slate-900 p-2 rounded-lg border border-slate-800/80">"{scene.scriptMalay}"</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 font-medium mb-0.5">Prompt Visual (AI Video):</p>
                      <p className="text-[11px] text-slate-400 bg-slate-900 p-2 rounded-lg border border-slate-800/80">{scene.visualPrompt}</p>
                    </div>
                  </div>

                  {/* Paparan Pemain Video / Butang Jana */}
                  <div className="mt-2 flex flex-col gap-2">
                    {state.url ? (
                      <div className="flex flex-col gap-2">
                        <video src={state.url} controls className="w-full h-40 object-cover rounded-lg bg-black" />
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
                        {state.isGenerating ? state.status : `🎬 Jana Klip Adegan ${scene.sceneNumber} (1 Kredit)`}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
