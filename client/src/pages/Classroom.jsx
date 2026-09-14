import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import VideoGrid from '../components/VideoGrid'
import Controls from '../components/Controls'
import Whiteboard from '../components/Whiteboard'
import { videoProcessor } from '../utils/videoProcessor'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

function Materials({ classroom, isStaff, onChanged, onOpenBoard }) {
  const [title, setTitle] = useState('')
  const [paid, setPaid] = useState(classroom.progress.lessonsPaid ?? '')
  const [error, setError] = useState('')

  const addBoard = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const { board } = await api.createBoard(classroom.id, title || `Board ${new Date().toLocaleDateString()}`)
      setTitle('')
      await onChanged()
      onOpenBoard(board.id)
    } catch (err) {
      setError(err.message)
    }
  }

  const savePackage = async (resetCounter) => {
    setError('')
    try {
      await api.updatePackage(classroom.id, {
        lessonsPaid: paid === '' ? null : Number(paid),
        resetCounter
      })
      await onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleCounted = async (session) => {
    await api.updateSession(classroom.id, session.id, { counted: !session.counted })
    await onChanged()
  }

  const removeSession = async (session) => {
    if (!window.confirm('Remove this lesson from the record?')) return
    await api.deleteSession(classroom.id, session.id)
    await onChanged()
  }

  const { progress } = classroom

  return (
    <div className="materials">
      {error && <div className="error">{error}</div>}

      {isStaff && (
        <section>
          <h2>Lesson package</h2>
          <div className="package-box">
            <div className="package-count">
              <strong>{progress.held}</strong>
              <span className="muted">
                {progress.lessonsPaid == null
                  ? 'lessons held'
                  : `of ${progress.lessonsPaid} paid`}
              </span>
              {progress.remaining != null && (
                <span className={progress.remaining > 0 ? 'paid-badge active' : 'paid-badge'}>
                  {progress.remaining > 0 ? `${progress.remaining} left` : 'package finished'}
                </span>
              )}
            </div>

            <div className="package-controls">
              <input
                type="number"
                min="0"
                placeholder="Lessons paid"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                style={{ width: 130 }}
              />
              <button onClick={() => savePackage(false)}>Save</button>
              <button className="ghost" onClick={() => savePackage(true)}>
                Save and start new package
              </button>
            </div>
          </div>
          {progress.packageStartedAt && (
            <p className="muted">
              Counting from {new Date(progress.packageStartedAt).toLocaleDateString()}
            </p>
          )}
        </section>
      )}

      <section>
        <h2>Boards</h2>
        {isStaff && (
          <form className="inline-form" onSubmit={addBoard}>
            <input
              placeholder="Board title, e.g. Present Perfect — 14 Sep"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button type="submit">New board</button>
          </form>
        )}

        {classroom.boards.length === 0 && <p className="muted">No boards yet.</p>}

        <div className="list">
          {classroom.boards.map((board) => (
            <div key={board.id} className="row">
              <div>
                <strong>{board.title}</strong>
                <div className="muted">
                  Updated {new Date(board.updatedAt).toLocaleString()}
                </div>
              </div>
              <div className="row-actions">
                <button onClick={() => onOpenBoard(board.id)}>Open</button>
                {isStaff && (
                  <button
                    className="ghost"
                    onClick={async () => {
                      if (!window.confirm(`Delete "${board.title}"?`)) return
                      await api.deleteBoard(classroom.id, board.id)
                      await onChanged()
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Lessons held</h2>
        {classroom.sessions.length === 0 && <p className="muted">No lessons yet.</p>}

        <div className="list">
          {classroom.sessions.map((session) => (
            <div key={session.id} className="row">
              <div>
                <strong>{new Date(session.startedAt).toLocaleString()}</strong>
                <div className="muted">
                  {session.endedAt
                    ? `${session.minutes} min`
                    : 'in progress'}
                  {!session.counted && ' · not counted'}
                </div>
              </div>
              {isStaff && (
                <div className="row-actions">
                  <button className="ghost" onClick={() => toggleCounted(session)}>
                    {session.counted ? 'Do not count' : 'Count'}
                  </button>
                  <button className="ghost" onClick={() => removeSession(session)}>Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default function Classroom() {
  const { id } = useParams()
  const { user } = useAuth()
  const [classroom, setClassroom] = useState(null)
  const [error, setError] = useState('')
  const [view, setView] = useState('materials')
  const [callState, setCallState] = useState('idle')
  const [mediaWarning, setMediaWarning] = useState('')
  const [openBoardId, setOpenBoardId] = useState(null)
  const [peers, setPeers] = useState({})
  const [screenStream, setScreenStream] = useState(null)
  const [isBlurEnabled, setIsBlurEnabled] = useState(false)
  const [blurAmount, setBlurAmount] = useState(12)

  const socketRef = useRef(null)
  const localStreamRef = useRef(null)
  const connectionsRef = useRef({})
  const localVideoRef = useRef(null)
  const screenVideoRef = useRef(null)
  const drawingCanvasRef = useRef(null)
  const processingCanvasRef = useRef(null)
  const animationRef = useRef(null)

  const isStaff = user.role === 'OWNER' || user.role === 'TEACHER'

  const refresh = async () => {
    const { classroom } = await api.getClassroom(id)
    setClassroom(classroom)
  }

  // The socket is opened for the whole visit; joining without withCall means
  // looking at materials does not start a lesson.
  useEffect(() => {
    let disposed = false

    refresh().catch((err) => setError(err.message))

    const socket = io({ withCredentials: true })
    socketRef.current = socket

    socket.on('connect_error', (err) => setError(err.message))

    socket.emit('join-classroom', id, {}, (response) => {
      if (response?.error && !disposed) setError(response.error)
    })

    socket.on('user-joined', ({ id: peerId, name }) => {
      setPeers((prev) => ({ ...prev, [peerId]: { name, stream: null } }))
    })

    socket.on('user-left', (peerId) => {
      connectionsRef.current[peerId]?.close()
      delete connectionsRef.current[peerId]
      setPeers((prev) => {
        const next = { ...prev }
        delete next[peerId]
        return next
      })
    })

    socket.on('board:switched', (boardId) => setOpenBoardId(boardId))

    return () => {
      disposed = true
      socket.disconnect()
      Object.values(connectionsRef.current).forEach((pc) => pc.close())
      connectionsRef.current = {}
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [id])

  const createConnection = (peerId, peerName) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    const stream = localStreamRef.current
    if (stream) stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    pc.ontrack = (event) => {
      setPeers((prev) => ({ ...prev, [peerId]: { name: peerName, stream: event.streams[0] } }))
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', { to: peerId, candidate: event.candidate })
      }
    }

    connectionsRef.current[peerId] = pc
    return pc
  }

  const startCall = async () => {
    setCallState('starting')
    setView('call')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: true
      })
      localStreamRef.current = stream
      if (localVideoRef.current) localVideoRef.current.srcObject = stream
    } catch {
      setMediaWarning('Camera and microphone are off — others will not see or hear you.')
    }

    const socket = socketRef.current

    socket.on('offer', async ({ from, offer }) => {
      const pc = connectionsRef.current[from] ?? createConnection(from, 'Participant')
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('answer', { to: from, answer })
    })

    socket.on('answer', async ({ from, answer }) => {
      await connectionsRef.current[from]?.setRemoteDescription(new RTCSessionDescription(answer))
    })

    socket.on('ice-candidate', async ({ from, candidate }) => {
      const pc = connectionsRef.current[from]
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
          console.error('ICE error:', err)
        }
      }
    })

    socket.emit('call:start', async () => {
      for (const [peerId, peer] of Object.entries(peers)) {
        const pc = createConnection(peerId, peer.name)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('offer', { to: peerId, offer })
      }
      setCallState('live')
      refresh().catch(() => {})
    })
  }

  useEffect(() => {
    if (!isBlurEnabled) return
    let cancelled = false

    videoProcessor.onFrame = (results) => {
      const canvas = processingCanvasRef.current
      const video = localVideoRef.current
      if (!canvas || !video) return

      const width = video.videoWidth || 640
      const height = video.videoHeight || 480
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      ctx.save()
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(results.segmentationMask, 0, 0, width, height)
      ctx.globalCompositeOperation = 'source-in'
      ctx.drawImage(results.image, 0, 0, width, height)
      ctx.globalCompositeOperation = 'destination-over'
      ctx.filter = `blur(${blurAmount}px)`
      ctx.drawImage(results.image, 0, 0, width, height)
      ctx.restore()
    }

    const loop = async () => {
      if (cancelled) return
      const video = localVideoRef.current
      if (video && video.readyState >= 2) {
        try {
          await videoProcessor.send(video)
        } catch (err) {
          console.error('Segmentation error:', err)
        }
      }
      if (!cancelled) animationRef.current = requestAnimationFrame(loop)
    }

    videoProcessor.initialize()
      .then(() => { if (!cancelled) loop() })
      .catch((err) => console.error('Segmentation init failed:', err))

    return () => {
      cancelled = true
      videoProcessor.onFrame = null
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [isBlurEnabled, blurAmount])

  const toggleTrack = (kind) => () => {
    localStreamRef.current?.getTracks()
      .filter((track) => track.kind === kind)
      .forEach((track) => { track.enabled = !track.enabled })
  }

  const shareScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      setScreenStream(stream)
      if (screenVideoRef.current) screenVideoRef.current.srcObject = stream
      socketRef.current?.emit('screen-share-start')

      stream.getVideoTracks()[0].onended = () => {
        setScreenStream(null)
        socketRef.current?.emit('screen-share-stop')
      }
    } catch (err) {
      console.error('Screen share cancelled:', err)
    }
  }

  const openBoard = (boardId) => {
    setOpenBoardId(boardId)
    setView('board')
  }

  if (error && !classroom) {
    return (
      <div className="centered">
        <div className="card">
          <h2>Cannot open this classroom</h2>
          <p className="error">{error}</p>
          <Link className="button" to="/classroom">Back</Link>
        </div>
      </div>
    )
  }

  if (!classroom) return <div className="centered">Loading…</div>

  const partner = user.role === 'STUDENT' ? classroom.teacher.name : classroom.student.name

  return (
    <div className="lesson-page">
      <header className="topbar">
        <div className="nav-identity">
          <strong>{partner}</strong>
          {isStaff && (
            <span className="muted">
              {' · '}{classroom.progress.held}
              {classroom.progress.lessonsPaid != null && ` / ${classroom.progress.lessonsPaid}`} lessons
            </span>
          )}
        </div>

        <div className="lesson-tabs">
          <button
            className={`lesson-tab ${view === 'materials' ? 'active' : ''}`}
            onClick={() => setView('materials')}
          >
            Materials
          </button>
          <button
            className={`lesson-tab ${view === 'call' ? 'active' : ''}`}
            onClick={() => (callState === 'idle' ? startCall() : setView('call'))}
          >
            {callState === 'idle' ? 'Start call' : 'Call'}
          </button>
          {openBoardId && (
            <button
              className={`lesson-tab ${view === 'board' ? 'active' : ''}`}
              onClick={() => setView('board')}
            >
              Board
            </button>
          )}
        </div>

        <Link className="ghost" to="/classroom">Leave</Link>
      </header>

      {error && <div className="banner warning">{error}</div>}
      {view === 'call' && callState === 'starting' && (
        <div className="banner">Waiting for camera and microphone access…</div>
      )}
      {view === 'call' && mediaWarning && <div className="banner warning">{mediaWarning}</div>}

      {view === 'materials' && (
        <div className="view-pane scrollable">
          <div className="page">
            <Materials
              classroom={classroom}
              isStaff={isStaff}
              onChanged={refresh}
              onOpenBoard={openBoard}
            />
          </div>
        </div>
      )}

      {/* The call stays mounted once started so switching tabs never drops it. */}
      {callState !== 'idle' && (
        <div className="view-pane" hidden={view !== 'call'}>
          <VideoGrid
            peers={peers}
            screenStream={screenStream}
            localVideoRef={localVideoRef}
            screenVideoRef={screenVideoRef}
            drawingCanvasRef={drawingCanvasRef}
            processingCanvasRef={processingCanvasRef}
            isBlurEnabled={isBlurEnabled}
            socketRef={socketRef}
          />
        </div>
      )}

      {view === 'board' && openBoardId && (
        <div className="view-pane">
          <Whiteboard socketRef={socketRef} boardId={openBoardId} />
        </div>
      )}

      {view === 'call' && callState !== 'idle' && (
        <Controls
          onToggleCamera={toggleTrack('video')}
          onToggleMicrophone={toggleTrack('audio')}
          onShareScreen={shareScreen}
          hasScreenStream={Boolean(screenStream)}
          isBlurEnabled={isBlurEnabled}
          onBlurToggle={() => setIsBlurEnabled((value) => !value)}
          blurAmount={blurAmount}
          onBlurChange={setBlurAmount}
        />
      )}
    </div>
  )
}
