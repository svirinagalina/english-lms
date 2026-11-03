import { AudioPresets, ParticipantEvent, Room, RoomEvent, Track, VideoPresets, VideoQuality } from 'livekit-client'

// Calls through the media server (LiveKit on srv3, see server/src/sfu.js):
// each person sends their sound and picture once, to the server, which
// forwards them to the others and resends what got lost on the way — instead
// of every person sending to every other one directly. The call page keeps
// doing everything else as before (noise removal, blur, the board, the chat
// over socket.io); this only carries the tracks. Our identity in the room is
// our socket id, so remote tracks land on the peers the page already knows.
//
// The tracks are ours (the denoiser's output, the blurred camera): LiveKit
// never stops or restarts them, and leaving the room leaves them running.
export async function joinSfu({ url, token, onStream, onLeft, onState }) {
  // adaptiveStream would pause video for elements LiveKit doesn't attach
  // itself (our <video>s use srcObject), so it stays off; dynacast stops
  // sending simulcast layers nobody watches.
  const room = new Room({ adaptiveStream: false, dynacast: true, disconnectOnPageLeave: true })

  const update = (participant) => {
    const tracks = []
    let screen = null
    // A shared screen's sound is played on its own (below), not in the tile;
    // the screen itself comes as a stream of its own, so the person's camera
    // stays in their tile while they share.
    participant.trackPublications.forEach((pub) => {
      if (!pub.isSubscribed || !pub.track?.mediaStreamTrack || pub.source === Track.Source.ScreenShareAudio) return
      if (pub.source === Track.Source.ScreenShare) screen = pub.track.mediaStreamTrack
      else tracks.push(pub.track.mediaStreamTrack)
    })
    // A new MediaStream each time: adding a track to an existing one from
    // script fires no 'addtrack', and the tile listens for a changed stream.
    onStream(participant.identity, participant.name || 'Participant', tracks.length ? new MediaStream(tracks) : null, screen ? new MediaStream([screen]) : null)
  }
  room.on(RoomEvent.TrackSubscribed, (_track, _pub, participant) => update(participant))
  room.on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => update(participant))
  // The sound of someone's shared tab (a video, a listening exercise): played
  // as it is, in a hidden <audio> of its own — never through the denoiser,
  // which takes music and recordings for noise. A browser that blocked the
  // autoplay gets it on the next click or key anywhere on the page.
  const screenAudio = new Map()
  const retryPlay = () => screenAudio.forEach((el) => el.play().catch(() => {}))
  window.addEventListener('pointerdown', retryPlay)
  window.addEventListener('keydown', retryPlay)
  room.on(RoomEvent.TrackSubscribed, (track, pub) => {
    if (pub.source !== Track.Source.ScreenShareAudio) return
    const el = track.attach()
    el.style.display = 'none'
    document.body.appendChild(el)
    screenAudio.set(pub.trackSid, el)
    el.play().catch(() => {})
  })
  // LiveKit has already detached the element by now: it is removed by key.
  room.on(RoomEvent.TrackUnsubscribed, (track, pub) => {
    if (pub.source !== Track.Source.ScreenShareAudio) return
    track.detach()
    screenAudio.get(pub.trackSid)?.remove()
    screenAudio.delete(pub.trackSid)
  })
  room.on(RoomEvent.Disconnected, () => {
    screenAudio.forEach((el) => el.remove())
    screenAudio.clear()
    window.removeEventListener('pointerdown', retryPlay)
    window.removeEventListener('keydown', retryPlay)
  })
  // Someone gone from the media room (left, or an old copy of a person who
  // reconnected, removed by the server): their tile goes too. Clearing only
  // the picture left an empty "second Oleg" on the teacher's screen.
  // On a weak connection the others' cameras come in small ('low') or not
  // at all ('off'), so what bandwidth there is goes to the sound. A shared
  // screen is always kept. Applied to cameras that appear later as well.
  let incoming = 'high'
  const applyIncoming = (pub) => {
    if (pub.kind !== Track.Kind.Video || pub.source === Track.Source.ScreenShare) return
    try {
      pub.setEnabled(incoming !== 'off')
      if (incoming !== 'off') pub.setVideoQuality(incoming === 'low' ? VideoQuality.LOW : VideoQuality.HIGH)
    } catch { /* not subscribed yet */ }
  }
  room.on(RoomEvent.TrackSubscribed, (_track, pub) => applyIncoming(pub))
  room.on(RoomEvent.ParticipantDisconnected, (participant) => onLeft?.(participant.identity))
  // `leaving`: we closed it ourselves (left the call, a new socket id) —
  // otherwise a 'disconnected' is a lost connection the page joins again.
  let leaving = false
  room.on(RoomEvent.ConnectionStateChanged, (state) => onState?.(state, { leaving }))

  await room.connect(url, token, { autoSubscribe: true })

  const pubs = { audio: null, video: null, screen: null, screenAudio: null }
  // LiveKit mutes a publication by itself when its track ends — and the old
  // microphone track is stopped right around a swap (the denoiser giving way
  // to the plain microphone). The microphone publication then stayed muted:
  // no packets at all reached a student for the rest of the lesson
  // (2026-10-09). Muting the microphone on this page only disables the track,
  // so a muted audio publication with a live track is always undone.
  room.localParticipant.on(ParticipantEvent.TrackMuted, (pub) => {
    if (pub.kind === Track.Kind.Audio && pub === pubs.audio && pub.track?.mediaStreamTrack?.readyState === 'live') pub.unmute().catch(() => {})
  })
  const publish = async (kind, track) => {
    if (!track || room.state === 'disconnected') return
    const pub = pubs[kind]
    if (pub?.track) {
      if (pub.track.mediaStreamTrack !== track) await pub.track.replaceTrack(track, true)
      if (pub.isMuted) await pub.unmute()
      return
    }
    pubs[kind] = await room.localParticipant.publishTrack(track, kind === 'audio'
      // red: every packet also carries the previous ones, so a lost packet
      // costs no sound — the loss that made a teacher's voice break up.
      ? { source: Track.Source.Microphone, red: true, stopMicTrackOnMute: false }
      : { source: Track.Source.Camera, simulcast: true, videoEncoding: { maxBitrate: 450_000, maxFramerate: 15 }, videoSimulcastLayers: [VideoPresets.h180] })
  }

  // The stats of one remote person's audio, for the call's diagnostics.
  const remoteReport = async (identity, kind = Track.Kind.Audio) => {
    const participant = room.remoteParticipants.get(identity)
    let report
    participant?.trackPublications.forEach((pub) => { if (!report && pub.kind === kind && pub.track) report = pub.track })
    return report ? report.getRTCStatsReport() : undefined
  }

  return {
    room,
    setAudio: (track) => publish('audio', track),
    setVideo: (track) => publish('video', track),
    // The screen as its own publication: sharp (up to 1080p, ~2.5 Mbps, no
    // small simulcast layers) instead of going out in the camera's place at
    // the camera's 450 kbps and size, which made text unreadable. The camera
    // keeps going beside it (Galina, 2026-10-20: the teacher's face must not
    // disappear while she shows her screen).
    // `audioTrack`: the shared tab's sound, published beside it untouched
    // (no echo cancelling, no voice coding: the music preset).
    setScreen: async (track, audioTrack = null) => {
      if (room.state === 'disconnected') return
      if (pubs.screenAudio?.track && pubs.screenAudio.track.mediaStreamTrack !== audioTrack) {
        await room.localParticipant.unpublishTrack(pubs.screenAudio.track, false).catch(() => {})
        pubs.screenAudio = null
      }
      if (track && audioTrack && !pubs.screenAudio) {
        pubs.screenAudio = await room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.ScreenShareAudio, audioPreset: AudioPresets.music, dtx: false, red: false
        }).catch((err) => { console.error('Media server: screen sound not sent', err); return null })
      }
      if (track) {
        if (pubs.screen?.track?.mediaStreamTrack === track) return
        if (pubs.screen?.track) await room.localParticipant.unpublishTrack(pubs.screen.track, false).catch(() => {})
        pubs.screen = await room.localParticipant.publishTrack(track, {
          source: Track.Source.ScreenShare, simulcast: false,
          videoEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 }, degradationPreference: 'maintain-resolution'
        })
        return
      }
      if (pubs.screen?.track) await room.localParticipant.unpublishTrack(pubs.screen.track, false).catch(() => {})
      pubs.screen = null
    },
    muteVideo: () => pubs.video?.mute(),
    audioTrack: () => pubs.audio?.track?.mediaStreamTrack ?? null,
    outboundAudioReport: () => pubs.audio?.track?.getRTCStatsReport() ?? Promise.resolve(undefined),
    remoteReport,
    remoteIds: () => [...room.remoteParticipants.keys()],
    setIncoming: (level) => {
      if (level === incoming) return
      incoming = level
      room.remoteParticipants.forEach((p) => p.trackPublications.forEach(applyIncoming))
    },
    // stopTracks=false: our tracks belong to the call page, not to LiveKit.
    leave: () => { leaving = true; return room.disconnect(false) }
  }
}
