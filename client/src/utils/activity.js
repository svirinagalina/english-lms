import { api } from '../api'

// Tells the server which part of the platform the person opened, for the
// owner's activity view. The same section counts once per two minutes.
const lastSent = new Map()
export function trackSection(section) {
  const now = Date.now()
  if (now - (lastSent.get(section) ?? 0) < 2 * 60 * 1000) return
  lastSent.set(section, now)
  api.trackSection(section).catch(() => {})
}

export function sectionOf(pathname) {
  if (pathname === '/') return 'home'
  if (pathname.startsWith('/practice/mistakes')) return 'mistakes'
  const first = pathname.split('/')[1]
  return {
    classroom: 'classroom', call: 'call', practice: 'practice', trainer: 'trainer', vocabulary: 'vocabulary',
    dictionary: 'dictionary', courses: 'courses', progress: 'progress', report: 'report', billing: 'billing',
    plans: 'plans', calendar: 'calendar', todo: 'todo', timetable: 'timetable', profile: 'profile',
    settings: 'settings', people: 'people', content: 'content', 'try-board': 'board'
  }[first] ?? null
}
