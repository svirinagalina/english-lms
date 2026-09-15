import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import Nav from '../components/Nav'

// Sources → Editing → Ready. The owner drops raw text and photos into
// Sources, the partner posts an edited version into Editing, the owner
// makes final corrections and marks it Ready.
const STAGES = [
  { id: 'SOURCE', label: 'Sources', hint: 'Raw text and photos for future posts.' },
  { id: 'EDITING', label: 'Editing', hint: 'Edited versions waiting for final corrections.' },
  { id: 'READY', label: 'Ready', hint: 'Approved and ready to publish.' }
]

const NETWORKS = ['Instagram', 'Telegram', 'VK', 'YouTube', 'TikTok', 'Other']
const FORMATS = ['Post', 'Story', 'Reel', 'Video', 'Text', 'Other']

const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

// One text often goes to several places: every label is a toggle.
function LabelPicker({ options, selected, onChange }) {
  const toggle = (label) =>
    onChange(selected.includes(label) ? selected.filter((l) => l !== label) : [...selected, label])
  return (
    <div className="label-picker">
      {options.map((label) => (
        <button
          key={label}
          type="button"
          className={`label-chip ${selected.includes(label) ? 'on' : ''}`}
          onClick={() => toggle(label)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function TargetFields({ value, onChange }) {
  return (
    <div className="label-rows">
      <LabelPicker options={NETWORKS} selected={value.networks ?? []} onChange={(networks) => onChange({ ...value, networks })} />
      <LabelPicker options={FORMATS} selected={value.formats ?? []} onChange={(formats) => onChange({ ...value, formats })} />
    </div>
  )
}

function FileList({ item, onChanged }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState('')

  const upload = async (files) => {
    setError('')
    for (const file of files) {
      setUploading((n) => n + 1)
      try {
        await api.uploadContentFile(item.id, file)
      } catch (err) {
        setError(`${file.name}: ${err.message}`)
      } finally {
        setUploading((n) => n - 1)
      }
    }
    await onChanged()
  }

  const remove = async (file) => {
    if (!window.confirm(`Remove ${file.name}?`)) return
    await api.deleteContentFile(item.id, file.id)
    await onChanged()
  }

  return (
    <div className="content-files">
      {item.files.map((file) => (
        <div key={file.id} className="content-file">
          {file.mime.startsWith('image/') ? (
            <a href={file.url} target="_blank" rel="noreferrer">
              <img src={file.url} alt={file.name} />
            </a>
          ) : file.mime.startsWith('video/') ? (
            <video src={file.url} controls preload="metadata" />
          ) : (
            <a className="content-file-doc" href={file.url} target="_blank" rel="noreferrer">{file.name}</a>
          )}
          <div className="content-file-meta">
            <span className="muted" title={file.name}>{file.name} · {formatSize(file.size)}</span>
            <button className="ghost small" onClick={() => remove(file)}>×</button>
          </div>
        </div>
      ))}
      <div className="content-file add">
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept="image/*,video/*,audio/*,.pdf,.txt"
          onChange={(e) => { upload([...e.target.files]); e.target.value = '' }}
        />
        <button className="ghost" onClick={() => inputRef.current?.click()} disabled={uploading > 0}>
          {uploading > 0 ? `Uploading ${uploading}…` : '+ Add files'}
        </button>
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  )
}

function ItemCard({ item, stage, sources, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const startEdit = () => {
    setDraft({ title: item.title, body: item.body ?? '', networks: item.networks ?? [], formats: item.formats ?? [], sourceId: item.source?.id ?? '' })
    setEditing(true)
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await api.updateContent(item.id, { ...draft, sourceId: draft.sourceId || null })
      setEditing(false)
      await onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const move = async (to) => {
    setBusy(true)
    try {
      await api.updateContent(item.id, { stage: to })
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  // The partner's way in: a new Editing item that remembers its source.
  const startEditingFrom = async () => {
    setBusy(true)
    try {
      await api.createContent({
        title: item.title,
        body: item.body ?? '',
        networks: item.networks,
        formats: item.formats,
        stage: 'EDITING',
        sourceId: item.id
      })
      await onChanged('EDITING')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete "${item.title}"?`)) return
    await api.deleteContent(item.id)
    await onChanged()
  }

  return (
    <div className="row column content-card">
      {editing ? (
        <div className="details-form">
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" />
          <TargetFields value={draft} onChange={setDraft} />
          {stage !== 'SOURCE' && (
            <select value={draft.sourceId} onChange={(e) => setDraft({ ...draft, sourceId: e.target.value })}>
              <option value="">No source</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          )}
          <textarea rows={8} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Text" />
          {error && <div className="error">{error}</div>}
          <div className="editor-actions">
            <button onClick={save} disabled={busy || !draft.title.trim()}>Save</button>
            <button className="ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="row-main">
            <div>
              <strong>{item.title}</strong>
              <div className="mistake-tags content-tags">
                {item.networks.map((n) => <span key={n} className="mistake-tag">{n}</span>)}
                {item.formats.map((f) => <span key={f} className="mistake-tag format">{f}</span>)}
              </div>
              <div className="muted">
                {item.author.name} · {new Date(item.updatedAt).toLocaleString()}
                {item.source && ` · from “${item.source.title}”`}
              </div>
            </div>
            <div className="row-actions">
              {stage === 'SOURCE' && <button onClick={startEditingFrom} disabled={busy}>Start editing</button>}
              {stage === 'EDITING' && <button onClick={() => move('READY')} disabled={busy}>Mark ready</button>}
              {stage === 'READY' && <button className="ghost" onClick={() => move('EDITING')} disabled={busy}>Back to editing</button>}
              <button className="ghost" onClick={startEdit}>Edit</button>
              <button className="ghost" onClick={remove}>Delete</button>
            </div>
          </div>
          {item.body && <pre className="content-body">{item.body}</pre>}
        </>
      )}
      <FileList item={item} onChanged={onChanged} />
    </div>
  )
}

function NewItemForm({ stage, onCreated }) {
  const [draft, setDraft] = useState({ title: '', body: '', networks: [], formats: [] })
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { item } = await api.createContent({ ...draft, stage })
      for (const file of files) {
        try { await api.uploadContentFile(item.id, file) } catch (err) { setError(`${file.name}: ${err.message}`) }
      }
      setDraft({ title: '', body: '', networks: [], formats: [] })
      setFiles([])
      await onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="details-form content-new" onSubmit={submit}>
      <input
        placeholder="Title"
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        required
      />
      <TargetFields value={draft} onChange={setDraft} />
      <textarea
        rows={4}
        placeholder="Text for the post (optional)"
        value={draft.body}
        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
      />
      <div className="row-actions">
        <input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.txt" onChange={(e) => setFiles([...e.target.files])} />
        <button type="submit" disabled={busy || !draft.title.trim()}>{busy ? 'Saving…' : 'Add'}</button>
      </div>
      {error && <div className="error">{error}</div>}
    </form>
  )
}

function ApiAccess() {
  const [tokens, setTokens] = useState([])
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState(null)
  const [open, setOpen] = useState(false)

  const refresh = () => api.listApiTokens().then(({ tokens }) => setTokens(tokens)).catch(() => {})
  useEffect(() => { refresh() }, [])

  const create = async (event) => {
    event.preventDefault()
    const { token, item } = await api.createApiToken(name || 'API token')
    setFresh({ token, name: item.name })
    setName('')
    await refresh()
  }

  const revoke = async (token) => {
    if (!window.confirm(`Revoke “${token.name}”? Scripts using it will stop working.`)) return
    await api.deleteApiToken(token.id)
    await refresh()
  }

  const origin = window.location.origin

  return (
    <section>
      <h2>API access</h2>
      <p className="muted" style={{ marginBottom: 10 }}>
        Personal tokens let a script read and add content without the browser. A token is shown once, when created.
      </p>

      {fresh && (
        <div className="notice">
          Token “{fresh.name}” — copy it now, it will not be shown again:
          <code className="invite-link">{fresh.token}</code>
        </div>
      )}

      <form className="inline-form" onSubmit={create}>
        <input placeholder="Token name (e.g. Maxim's laptop)" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit">Create token</button>
      </form>

      {tokens.length > 0 && (
        <div className="list">
          {tokens.map((token) => (
            <div key={token.id} className="row">
              <div>
                <strong>{token.name}</strong>
                <div className="muted">
                  {token.prefix}… · created {new Date(token.createdAt).toLocaleDateString()}
                  {token.lastUsedAt ? ` · last used ${new Date(token.lastUsedAt).toLocaleString()}` : ' · never used'}
                </div>
              </div>
              <button className="ghost" onClick={() => revoke(token)}>Revoke</button>
            </div>
          ))}
        </div>
      )}

      <button className="ghost" style={{ marginTop: 12 }} onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide API reference' : 'Show API reference'}
      </button>

      {open && (
        <pre className="content-body api-doc">{`Base URL: ${origin}/api/content
Header:   Authorization: Bearer <token>

GET    /items?stage=SOURCE|EDITING|READY   list items (all stages if omitted)
GET    /items/:id                          one item with its files
POST   /items                              create — JSON: { title, body, networks, formats, stage, sourceId }
                                             networks / formats are arrays: ["Instagram","Telegram"], ["Post","Story"]
PATCH  /items/:id                          update any of those fields (stage moves the item)
DELETE /items/:id
POST   /items/:id/files                    upload — body is the file, headers:
                                             Content-Type: image/jpeg (or video/mp4, image/png, application/pdf…)
                                             X-File-Name: photo.jpg (URL-encoded)
DELETE /items/:id/files/:fileId
GET    /me                                 check the token

Examples:
curl -H "Authorization: Bearer $TOKEN" "${origin}/api/content/items?stage=SOURCE"

curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"title":"Present Perfect reel","body":"Edited text…","networks":["Instagram","Telegram"],"formats":["Reel"],"stage":"EDITING","sourceId":"<source id>"}' \\
  ${origin}/api/content/items

curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: video/mp4" -H "X-File-Name: reel.mp4" \\
  --data-binary @reel.mp4 ${origin}/api/content/items/<id>/files

Files are served from ${origin}<file.url>. Max file size 200 MB.`}</pre>
      )}
    </section>
  )
}

export default function Content() {
  const { user } = useAuth()
  const [stage, setStage] = useState('SOURCE')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)

  const refresh = async (nextStage) => {
    try {
      const { items } = await api.listContent()
      setItems(items)
      if (nextStage) setStage(nextStage)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const current = STAGES.find((s) => s.id === stage)
  const visible = items.filter((item) => item.stage === stage)
  const sources = items.filter((item) => item.stage === 'SOURCE')
  const count = (id) => items.filter((item) => item.stage === id).length

  return (
    <div className="page">
      <Nav title="Content" />
      {error && <div className="error">{error}</div>}

      <div className="stage-tabs">
        {STAGES.map((s) => (
          <button
            key={s.id}
            className={`nav-link ${s.id === stage ? 'active' : ''}`}
            onClick={() => { setStage(s.id); setAdding(false) }}
          >
            {s.label} <span className="muted">{count(s.id)}</span>
          </button>
        ))}
      </div>

      <section style={{ marginTop: 16 }}>
        <div className="row-main">
          <p className="muted">{current.hint}</p>
          <button onClick={() => setAdding((v) => !v)}>{adding ? 'Close' : `+ New in ${current.label.toLowerCase()}`}</button>
        </div>
        {adding && <NewItemForm stage={stage} onCreated={async () => { setAdding(false); await refresh() }} />}

        {loading ? (
          <p className="muted">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="muted" style={{ marginTop: 12 }}>Nothing here yet.</p>
        ) : (
          <div className="list" style={{ marginTop: 12 }}>
            {visible.map((item) => (
              <ItemCard key={item.id} item={item} stage={stage} sources={sources} onChanged={refresh} />
            ))}
          </div>
        )}
      </section>

      {user.role !== 'STUDENT' && <ApiAccess />}
    </div>
  )
}
