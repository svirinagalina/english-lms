import { useEffect, useState } from 'react'
import { api } from '../api'
import Nav from '../components/Nav'
import { SiteFooter } from '../components/Brand'

// Owner's settings. The AI key is pasted here and stored encrypted on the
// server; it is never shown again, only its last characters.
export default function Settings() {
  const [ai, setAi] = useState(null)
  const [provider, setProvider] = useState('openai')
  const [key, setKey] = useState('')
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const refresh = () => api.aiSettings().then(({ ai }) => {
    setAi(ai)
    if (ai.provider) setProvider(ai.provider)
    setModel(ai.model ?? '')
  }).catch((err) => setError(err.message))
  useEffect(() => { refresh() }, [])

  const save = async (event) => {
    event.preventDefault()
    setBusy('save'); setError(''); setNotice('')
    try {
      await api.saveAiSettings({ provider, key: key.trim() || undefined, model: model.trim() })
      setKey('')
      await refresh()
      setNotice('Saved. Press Test to check the key works.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }
  const test = async () => {
    setBusy('test'); setError(''); setNotice('')
    try {
      const { answer } = await api.testAiSettings()
      setNotice(`Works — the model answered “${answer}”. AI features are on.`)
    } catch (err) {
      setError(`The key does not work: ${err.message}`)
    } finally {
      setBusy('')
    }
  }
  const remove = async () => {
    if (!window.confirm('Remove the AI key? AI features switch off until a key is saved again.')) return
    setBusy('remove'); setError(''); setNotice('')
    try { await api.clearAiSettings(); await refresh(); setNotice('Key removed.') } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  if (!ai) return <div className="centered">Loading…</div>

  return (
    <div className="page">
      <Nav title="Settings" />

      <section>
        <h2>AI assistant</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Powers the trial-lesson report, lesson summaries with speaking questions, mistake classification, and Translate / Questions on the board.
          Paste an API key from <strong>platform.openai.com</strong> (OpenAI) or <strong>console.anthropic.com</strong> (Claude). It is stored encrypted and never shown again.
        </p>

        <div className={`row ${ai.configured ? '' : 'column'}`} style={{ marginBottom: 14 }}>
          <div>
            <strong>{ai.configured ? 'Configured' : 'Not configured'}</strong>
            <div className="muted">
              {ai.configured
                ? `${ai.provider === 'openai' ? 'OpenAI' : 'Claude'} · key ending ${ai.keyHint}${ai.model ? ` · model ${ai.model}` : ''}${ai.source === 'env' ? ' · set on the server' : ''}`
                : 'AI features are off; reports and summaries use templates.'}
            </div>
          </div>
          {ai.configured && (
            <div className="row-actions">
              <button className="ghost" onClick={test} disabled={busy === 'test'}>{busy === 'test' ? 'Testing…' : 'Test'}</button>
              {ai.source === 'settings' && <button className="ghost" onClick={remove} disabled={busy === 'remove'}>Remove</button>}
            </div>
          )}
        </div>

        {error && <div className="error">{error}</div>}
        {notice && <div className="notice">{notice}</div>}

        {ai.source !== 'env' && (
          <form className="billing-editor" onSubmit={save} autoComplete="off">
            <label>
              Provider
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="openai">OpenAI (GPT)</option>
                <option value="anthropic">Anthropic (Claude)</option>
              </select>
            </label>
            <label>
              API key {ai.configured && <span className="muted">(leave empty to keep the current one)</span>}
              <input
                type="password"
                placeholder={provider === 'openai' ? 'sk-proj-…' : 'sk-ant-…'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="new-password"
                spellCheck={false}
              />
            </label>
            <label>
              Model <span className="muted">(optional — default {provider === 'openai' ? 'gpt-5.5' : 'claude-opus-5'})</span>
              <input placeholder={provider === 'openai' ? 'gpt-5.5' : 'claude-opus-5'} value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
            <div className="editor-actions">
              <button type="submit" disabled={busy === 'save' || (!key.trim() && !ai.configured)}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </section>
      <SiteFooter />
    </div>
  )
}
