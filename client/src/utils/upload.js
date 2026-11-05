import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

const TRIES = 8

const pause = (ms, signal) => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
})

// Trying again helps with a dropped connection or a server restarting; not
// with a refusal (a full disk, a file that is not a PDF).
const refused = (error) => error.status >= 400 && error.status < 500 && error.status !== 409 && error.status !== 429

async function patiently(step, signal, beforeRetry) {
  for (let failures = 1; ; failures++) {
    try {
      return await step()
    } catch (error) {
      if (signal?.aborted || refused(error)) throw error
      if (failures >= TRIES) throw new Error(error.status ? error.message : 'The connection keeps dropping. Please try again in a while.')
      await pause(Math.min(30_000, 1000 * 2 ** failures), signal)
      if (signal?.aborted) throw error
      await beforeRetry?.()
    }
  }
}

// A textbook can be hundreds of megabytes: it goes up in small pieces, one at
// a time, and a dropped connection costs one piece, not the whole file.
// details: { kind: 'pdf', title, pages } or { kind: 'audio', textbookId, title }.
export async function uploadInChunks(file, details, { onProgress, signal } = {}) {
  const { upload } = await api.startTextbookUpload({ ...details, size: file.size })
  try {
    let sent = upload.received
    // A piece may have arrived even though its answer did not.
    const askWhereWeAre = async () => { sent = (await api.textbookUploadStatus(upload.id).catch(() => ({ received: sent }))).received }
    while (sent < file.size) {
      const { received } = await patiently(() => api.sendTextbookChunk(upload.id, sent, file.slice(sent, sent + upload.chunkBytes), signal), signal, askWhereWeAre)
      sent = received
      onProgress?.(sent / file.size)
    }
    return await patiently(() => api.finishTextbookUpload(upload.id), signal)
  } catch (error) {
    api.cancelTextbookUpload(upload.id).catch(() => {})
    throw error
  }
}

// The state behind a progress bar: what is going up, how far along, and a way
// to stop it. Closing the tab would lose the upload, so the browser asks first.
export function useUpload() {
  const [uploading, setUploading] = useState('')
  const [share, setShare] = useState(0)
  const stopRef = useRef(null)

  useEffect(() => {
    if (!uploading) return undefined
    const warn = (event) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  // Resolves to false when the person cancelled.
  const run = async (label, job) => {
    const stop = new AbortController()
    stopRef.current = stop
    setUploading(label)
    setShare(0)
    try {
      await job({ onProgress: setShare, signal: stop.signal })
      return true
    } catch (error) {
      if (stop.signal.aborted) return false
      throw error
    } finally {
      setUploading('')
    }
  }
  return { uploading, share, run, cancel: () => stopRef.current?.abort() }
}
