import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'
import Panel from '../components/Panel'

// Sleep and meditation stories in English. The owner generates them with the
// platform's AI key and reads them; students will get the listen-only view later.
export default function SleepStories() {
  const [data, setData] = useState(null)
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [playingId, setPlayingId] = useState(null)
  const playingRef = useRef(null)

  const load = () =>
    api.sleepStories()
      .then((res) => {
        setData(res)
        setTopic((current) => current || res.topics[0] || '')
      })
      .catch((err) => setError(err.message || 'Could not load stories'))

  useEffect(() => {
    load()
    return () => window.speechSynthesis?.cancel()
  }, [])

  const stop = () => {
    window.speechSynthesis?.cancel()
    playingRef.current = null
    setPlayingId(null)
  }

  const listen = (story) => {
    if (playingRef.current === story.id) return stop()
    if (!('speechSynthesis' in window)) return setError('This browser cannot read text aloud')
    stop()
    const utterance = new SpeechSynthesisUtterance(story.text)
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang === 'en-US')
    if (voice) utterance.voice = voice
    utterance.lang = 'en-US'
    utterance.rate = 0.8
    utterance.pitch = 0.9
    utterance.onend = stop
    utterance.onerror = stop
    playingRef.current = story.id
    setPlayingId(story.id)
    window.speechSynthesis.speak(utterance)
  }

  const generate = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.generateSleepStory(topic)
      await load()
    } catch (err) {
      setError(err.message || 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (story) => {
    if (!window.confirm(`Delete "${story.title}"?`)) return
    if (playingRef.current === story.id) stop()
    try {
      await api.deleteSleepStory(story.id)
      await load()
    } catch (err) {
      setError(err.message || 'Could not delete')
    }
  }

  return (
    <div className="page">
      <Nav title="Sleep stories" />
      {error && <div className="error">{error}</div>}

      <Panel id="sleep:generate" title="Create a story" defaultOpen>
        {data && !data.enabled && (
          <p style={{ color: 'var(--muted)' }}>
            The AI key is not set. Add it in Settings to create stories.
          </p>
        )}
        <form onSubmit={generate} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select value={topic} onChange={(e) => setTopic(e.target.value)} disabled={busy} style={{ flex: 1, minWidth: 220 }}>
            {(data?.topics ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="ghost" type="submit" disabled={busy || !topic || !data?.enabled}>
            {busy ? 'Writing…' : 'Create story'}
          </button>
        </form>
      </Panel>

      <Panel id="sleep:list" title={`Stories (${data?.stories.length ?? 0})`} defaultOpen>
        {data && data.stories.length === 0 && <p style={{ color: 'var(--muted)' }}>No stories yet.</p>}
        {(data?.stories ?? []).map((story) => (
          <div key={story.id} style={{ borderTop: '1px solid var(--line, #e7e0d4)', padding: '12px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <strong>{story.title}</strong>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>{story.minutes} min · {story.topic}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="ghost" onClick={() => listen(story)}>
                  {playingId === story.id ? 'Stop' : 'Listen'}
                </button>
                <button className="ghost" onClick={() => remove(story)}>Delete</button>
              </div>
            </div>
            <details style={{ marginTop: 8 }}>
              <summary>Read the text</summary>
              <div style={{ whiteSpace: 'pre-line', lineHeight: 1.6, marginTop: 8 }}>{story.text}</div>
            </details>
          </div>
        ))}
      </Panel>

      <SiteFooter />
    </div>
  )
}
