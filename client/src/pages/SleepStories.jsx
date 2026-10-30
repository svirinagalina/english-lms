import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'
import Panel from '../components/Panel'
import { startAmbient } from '../utils/sleepAmbient'

// Two sections, both owner-only for now: adult sleep stories in English, and
// bedtime stories for children in Russian (Sasha and Tirli).
const SECTIONS = [
  { kind: 'sleep', title: 'Sleep & meditation stories', lang: 'en-US', createTitle: 'Create a story' },
  { kind: 'kids', title: 'Bedtime stories for kids', lang: 'ru-RU', createTitle: 'Create a kids story' }
]

// Ambience matches the story: a train for the train stories, a soft drone for kids,
// the Arabian night otherwise.
function ambientFor(story) {
  if (story.kind === 'kids') return 'calm'
  if (/train/i.test(story.topic)) return 'train'
  return 'arabian'
}

// Sleep and meditation stories. The owner generates them with the platform's AI key
// and reads them; students will get the listen-only view later.
export default function SleepStories() {
  const [data, setData] = useState(null)
  const [topics, setTopics] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [playingId, setPlayingId] = useState(null)
  const [ambientOn, setAmbientOn] = useState(true)
  const playingRef = useRef(null)
  const narrationRef = useRef(null)
  const ambientRef = useRef(null)

  const load = () =>
    api.sleepStories()
      .then((res) => {
        setData(res)
        setTopics((current) => {
          const next = { ...current }
          for (const section of SECTIONS) {
            next[section.kind] = next[section.kind] || res.topics[section.kind][0] || ''
          }
          return next
        })
      })
      .catch((err) => setError(err.message || 'Could not load stories'))

  useEffect(() => {
    load()
    return () => {
      window.speechSynthesis?.cancel()
      narrationRef.current?.pause()
      ambientRef.current?.()
    }
  }, [])

  const stopAmbient = () => {
    ambientRef.current?.()
    ambientRef.current = null
  }

  const stop = () => {
    window.speechSynthesis?.cancel()
    if (narrationRef.current) {
      narrationRef.current.pause()
      narrationRef.current = null
    }
    stopAmbient()
    playingRef.current = null
    setPlayingId(null)
  }

  // Reads the story aloud with the browser voice, used when no recording exists.
  const speak = (story) => {
    if (!('speechSynthesis' in window)) return setError('This browser cannot read text aloud')
    const lang = story.language === 'ru' ? 'ru-RU' : 'en-US'
    const utterance = new SpeechSynthesisUtterance(story.text)
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)))
    if (voice) utterance.voice = voice
    utterance.lang = lang
    utterance.rate = 0.8
    utterance.pitch = 0.9
    utterance.onend = stop
    utterance.onerror = stop
    window.speechSynthesis.speak(utterance)
  }

  // Plays the recorded narration when the server has one; otherwise the browser voice.
  const listen = (story) => {
    if (playingRef.current === story.id) return stop()
    stop()
    playingRef.current = story.id
    setPlayingId(story.id)
    if (ambientOn) ambientRef.current = startAmbient(ambientFor(story), 0.5)

    const audio = new Audio(`/api/sleep-stories/${story.id}/audio`)
    audio.onended = stop
    audio.addEventListener('error', () => {
      if (narrationRef.current !== audio) return
      narrationRef.current = null
      speak(story)
    }, { once: true })
    narrationRef.current = audio
    audio.play().catch(() => {})
  }

  const generate = async (event, kind) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.generateSleepStory(topics[kind], kind)
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

      {data && !data.enabled && (
        <p style={{ color: 'var(--muted)' }}>
          The AI key is not set. Add it in Settings to create stories.
        </p>
      )}

      {SECTIONS.map((section) => {
        const stories = (data?.stories ?? []).filter((s) => s.kind === section.kind)
        return (
          <div key={section.kind}>
            <Panel id={`sleep:generate:${section.kind}`} title={section.createTitle} defaultOpen>
              <form onSubmit={(e) => generate(e, section.kind)} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <select
                  value={topics[section.kind] ?? ''}
                  onChange={(e) => setTopics({ ...topics, [section.kind]: e.target.value })}
                  disabled={busy}
                  style={{ flex: 1, minWidth: 220 }}
                >
                  {(data?.topics[section.kind] ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button className="ghost" type="submit" disabled={busy || !topics[section.kind] || !data?.enabled}>
                  {busy ? 'Writing…' : 'Create story'}
                </button>
              </form>
            </Panel>

            <Panel id={`sleep:list:${section.kind}`} title={`${section.title} (${stories.length})`} defaultOpen>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--muted)' }}>
                <input type="checkbox" checked={ambientOn} onChange={(e) => setAmbientOn(e.target.checked)} />
                Background sound
              </label>
              {data && stories.length === 0 && <p style={{ color: 'var(--muted)' }}>No stories yet.</p>}
              {stories.map((story) => (
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
          </div>
        )
      })}

      <SiteFooter />
    </div>
  )
}
