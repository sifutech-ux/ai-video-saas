export type SavedClip = {
  id: string
  prompt: string
  style: string
  enhancedPrompt: string
  createdAt: string
  blob: Blob
}

const DB_NAME = 'beshare-video'
const STORE = 'klip'

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveClip(clip: SavedClip) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(clip)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function listClips() {
  const db = await openDb()
  const clips = await new Promise<SavedClip[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).getAll()
    request.onsuccess = () => resolve((request.result as SavedClip[]) || [])
    request.onerror = () => reject(request.error)
  })
  db.close()
  return clips.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}
