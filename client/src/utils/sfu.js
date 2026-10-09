import { ParticipantEvent, Room, RoomEvent, Track, VideoPresets } from 'livekit-client'

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
export async function joinSfu({ url, token, onStream, onState }) {
  // adaptiveStream would pause video for elements LiveKit doesn't attach
  // itself (our <video>s use srcObject), so it stays off; dynacast stops
  // sending simulcast layers nobody watches.
  const room = new Room({ adaptiveStream: false, dynacast: true, disconnectOnPageLeave: true })

  const update = (participant) => {
    const tracks = []
    participant.trackPublications.forEach((pub) => { if (pub.isSubscribed && pub.track?.mediaStreamTrack) tracks.push(pub.track.mediaStreamTrack) })
    // A new MediaStream each time: adding a track to an existing one from
    // script fires no 'addtrack', and the tile listens for a changed stream.
    onStream(participant.identity, participant.name || 'Participant', tracks.length ? new MediaStream(tracks) : null)
  }
  room.on(RoomEvent.TrackSubscribed, (_track, _pub, participant) => update(participant))
  room.on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => update(participant))
  room.on(RoomEvent.ConnectionStateChanged, (state) => onState?.(state))

  await room.connect(url, token, { autoSubscribe: true })

  const pubs = { audio: null, video: null, screen: null }
  // LiveKit mutes a publication by itself when its track ends — and the old
  // microphone track is stopped right around a swap (the denoiser giving way
  // to the plain microphone). The microphone publication then stayed muted:
  // no packets at all reached a student for the rest of the lesson
  // (2026-10-09). Muting the microphone on this page only disables the track,
  // so a muted audio publication with a live track is always undone.
  room.localParticipant.on(ParticipantEvent.TrackMuted, (pub) => {
    if (pub.kind === Track.Kind.Audio && pub === pubs.audio && pub.track?.mediaStreamTrack?.readyState === 'live') pub.unmute().catch(() => {})
  })
  let cameraWhileSharing = null
  const publish = async (kind, track) => {
    if (!track || room.state === 'disconnected') return
    // While the screen is shown the camera is not sent; it comes back from here.
    if (kind === 'video' && pubs.screen) { cameraWhileSharing = track; return }
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
    // is taken off meanwhile, so the others still get one picture from us.
    setScreen: async (track) => {
      if (room.state === 'disconnected') return
      if (track) {
        if (pubs.screen?.track?.mediaStreamTrack === track) return
        if (pubs.screen?.track) await room.localParticipant.unpublishTrack(pubs.screen.track, false).catch(() => {})
        if (pubs.video?.track) {
          cameraWhileSharing = pubs.video.track.mediaStreamTrack
          await room.localParticipant.unpublishTrack(pubs.video.track, false).catch(() => {})
          pubs.video = null
        }
        pubs.screen = await room.localParticipant.publishTrack(track, {
          source: Track.Source.ScreenShare, simulcast: false,
          videoEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 }, degradationPreference: 'maintain-resolution'
        })
        return
      }
      if (pubs.screen?.track) await room.localParticipant.unpublishTrack(pubs.screen.track, false).catch(() => {})
      pubs.screen = null
      const camera = cameraWhileSharing
      cameraWhileSharing = null
      if (camera?.readyState === 'live') await publish('video', camera)
    },
    muteVideo: () => pubs.video?.mute(),
    audioTrack: () => pubs.audio?.track?.mediaStreamTrack ?? null,
    outboundAudioReport: () => pubs.audio?.track?.getRTCStatsReport() ?? Promise.resolve(undefined),
    remoteReport,
    remoteIds: () => [...room.remoteParticipants.keys()],
    // stopTracks=false: our tracks belong to the call page, not to LiveKit.
    leave: () => room.disconnect(false)
  }
}
