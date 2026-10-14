// /trial: trials are booked on Maxim's site (Galina, 2026-10-14) — this old
// address only points there. No automatic redirect, so a redirect on his side
// back to here can never loop.
const BOOKING = 'https://advent-academy.online/free-lesson'

export default function TrialBooking() {
  return (
    <div className="centered"><div className="card ll-card">
      <div className="ll-kicker">Advent Academy</div>
      <h1 className="ll-title">Бесплатный пробный урок</h1>
      <p className="ll-when">40 минут с преподавателем: определим уровень, поговорим о целях и составим план.</p>
      <a className="button ll-go" href={`${BOOKING}${window.location.search}`}>Выбрать время</a>
    </div></div>
  )
}
