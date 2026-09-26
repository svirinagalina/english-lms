import { useEffect, useState } from 'react'
import { api } from '../api'
import Nav, { refreshTrainerStatus } from '../components/Nav'
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
  const [links, setLinks] = useState({ solo: '', mentor: '' })
  const [linksNotice, setLinksNotice] = useState('')
  const [stripe, setStripe] = useState({ configured: false, keyHint: null, fromEnv: false })
  const [stripeKey, setStripeKey] = useState('')
  const [stripeNotice, setStripeNotice] = useState('')
  const [stripeError, setStripeError] = useState('')
  const [stripeBusy, setStripeBusy] = useState(false)
  const saveStripe = async (event) => {
    event.preventDefault()
    setStripeNotice(''); setStripeError(''); setStripeBusy(true)
    try {
      const { configured } = await api.saveStripeKey(stripeKey.trim())
      setStripeKey('')
      setStripe((s) => ({ ...s, configured, keyHint: configured ? '…saved' : null }))
      setStripeNotice(configured ? 'Saved. Students now get a checkout page with the amount filled in.' : 'Key removed.')
      api.offerLinks().then(({ stripe }) => setStripe(stripe)).catch(() => {})
    } catch (err) {
      setStripeError(err.message)
    } finally {
      setStripeBusy(false)
    }
  }

  // The Advent trainer's partner key (from KEY.txt): the trainer page for
  // students, their progress on the student's page, shared words.
  const [trainer, setTrainer] = useState({ configured: false, keyHint: null, fromEnv: false })
  const [trainerKey, setTrainerKey] = useState('')
  const [trainerNotice, setTrainerNotice] = useState('')
  const [trainerError, setTrainerError] = useState('')
  const [trainerBusy, setTrainerBusy] = useState(false)
  useEffect(() => { api.adventSettings().then(setTrainer).catch(() => {}) }, [])
  const saveTrainer = async (event) => {
    event.preventDefault()
    setTrainerNotice(''); setTrainerError(''); setTrainerBusy(true)
    try {
      const saved = await api.saveAdventKey(trainerKey.trim())
      setTrainerKey('')
      setTrainer(saved)
      refreshTrainerStatus() // Trainer shows up in the menu without a reload
      setTrainerNotice(saved.configured ? `Connected${saved.partner ? ` as “${saved.partner}”` : ''}. Students now have Trainer in their menu.` : 'Key removed: the trainer is disconnected.')
    } catch (err) {
      setTrainerError(err.message)
    } finally {
      setTrainerBusy(false)
    }
  }

  const refresh = () => api.aiSettings().then(({ ai }) => {
    setAi(ai)
    if (ai.provider) setProvider(ai.provider)
    setModel(ai.model ?? '')
  }).catch((err) => setError(err.message))
  useEffect(() => {
    refresh()
    api.offerLinks().then(({ links, stripe }) => { setLinks({ solo: links.solo ?? '', mentor: links.mentor ?? '' }); if (stripe) setStripe(stripe) }).catch(() => {})
  }, [])
  const saveLinks = async (event) => {
    event.preventDefault()
    setLinksNotice('')
    try {
      const { links: saved } = await api.saveOfferLinks({ solo: links.solo.trim(), mentor: links.mentor.trim() })
      setLinks({ solo: saved.solo ?? '', mentor: saved.mentor ?? '' })
      setLinksNotice('Saved.')
    } catch (err) {
      setLinksNotice(err.message)
    }
  }

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
      <section>
        <h2>Stripe — online payment</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          With the secret key from Stripe (Developers → API keys → <strong>Secret key</strong>, starts with <code>sk_live_</code>) the platform opens a checkout page with the exact amount in euros already filled in — the student never types a sum. Stored encrypted, never shown again.
        </p>
        <div className="row" style={{ marginBottom: 12 }}>
          <div>
            <strong>{stripe.configured ? 'Configured' : 'Not configured'}</strong>
            <div className="muted">{stripe.configured ? `Key ending ${stripe.keyHint}${stripe.fromEnv ? ' · set on the server' : ''}` : 'Until then the plan buttons open the payment link and ask the student to enter the amount.'}</div>
          </div>
        </div>
        {!stripe.fromEnv && (
          <form className="billing-editor" onSubmit={saveStripe} autoComplete="off">
            <label>
              Stripe secret key {stripe.configured && <span className="muted">(leave empty and save to remove)</span>}
              <input type="password" placeholder="sk_live_…" value={stripeKey} onChange={(e) => setStripeKey(e.target.value)} autoComplete="new-password" spellCheck={false} />
            </label>
            {stripeError && <div className="error">{stripeError}</div>}
            {stripeNotice && <div className="notice">{stripeNotice}</div>}
            <div className="editor-actions">
              <button type="submit" disabled={stripeBusy || !stripeKey.trim()}>{stripeBusy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </section>

      <section>
        <h2>Advent trainer</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          The partner key from <code>KEY.txt</code> (starts with <code>gal_</code>) connects the Advent trainer: students get <strong>Trainer</strong> in their menu (same account, words and progress as in the Advent cabinet and the Telegram bot), you see their trainer progress on their page, and words you add to their vocabulary go into their trainer flashcards too. Stored encrypted, checked with the trainer on saving, never shown again.
        </p>
        <div className="row" style={{ marginBottom: 12 }}>
          <div>
            <strong>{trainer.configured ? 'Connected' : 'Not connected'}</strong>
            {trainer.configured && <div className="muted">Key ending {trainer.keyHint}{trainer.fromEnv ? ' · set on the server' : ''}</div>}
          </div>
        </div>
        {!trainer.fromEnv && (
          <form className="billing-editor" onSubmit={saveTrainer} autoComplete="off">
            <label>
              Trainer key {trainer.configured && <span className="muted">(leave empty and save to disconnect)</span>}
              <input type="password" placeholder="gal_…" value={trainerKey} onChange={(e) => setTrainerKey(e.target.value)} autoComplete="new-password" spellCheck={false} />
            </label>
            {trainerError && <div className="error">{trainerError}</div>}
            {trainerNotice && <div className="notice">{trainerNotice}</div>}
            <div className="editor-actions">
              <button type="submit" disabled={trainerBusy || (!trainerKey.trim() && !trainer.configured)}>{trainerBusy ? 'Checking…' : 'Save'}</button>
            </div>
          </form>
        )}
      </section>

      <section>
        <h2>Trial offer — payment links</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Students who came through a trial lesson see the Solo and Mentor plans on their Payment page. Paste a payment link (e.g. Stripe) for each plan; without a link the plan shows a “Choose” button that sends you a note instead.
        </p>
        <form className="billing-editor" onSubmit={saveLinks}>
          <label>
            Solo — payment link
            <input type="url" placeholder="https://buy.stripe.com/…" value={links.solo} onChange={(e) => setLinks({ ...links, solo: e.target.value })} />
          </label>
          <label>
            Mentor — payment link
            <input type="url" placeholder="https://buy.stripe.com/…" value={links.mentor} onChange={(e) => setLinks({ ...links, mentor: e.target.value })} />
          </label>
          <div className="editor-actions">
            <button type="submit">Save links</button>
            {linksNotice && <span className="muted">{linksNotice}</span>}
          </div>
        </form>
      </section>
      <SiteFooter />
    </div>
  )
}
