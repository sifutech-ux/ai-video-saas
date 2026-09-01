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

export default function UgcStoryboard() {
  const [productName, setProductName] = useState('')
  const [productBenefits, setProductBenefits] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [scriptData, setScriptData] = useState<ScriptData | null>(null)

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

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 text-slate-100 mt-6">
      <div>
        <h2 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
          ✨ UGC Script & Storyboard Generator
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Bina skrip iklan TikTok/Reels 4-adegan secara automatik menggunakan Gemini AI.
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
            {scriptData.scenes.map((scene) => (
              <div key={scene.sceneNumber} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
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
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
