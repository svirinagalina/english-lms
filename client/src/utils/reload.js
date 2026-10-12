// After a deploy the page's old code asks for files that no longer exist
// (each build renames them): the call could not load its media-server part
// and someone stayed in a call with nobody (2026-10-12). Load the new
// version instead — once a minute at most, so a real outage can't loop.
export function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem('reloadedForVersion') || 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem('reloadedForVersion', String(Date.now()))
  } catch { /* private mode: still reload */ }
  window.location.reload()
  return true
}
