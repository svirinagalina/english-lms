// A stand-in for the socket, for a board that lives only in this browser:
// the free tier's "Try the board". It answers the same events Whiteboard
// sends (board:open/add/update/delete/clear) and keeps the elements in
// localStorage under `key`; there is nobody else to hear cursors or views.
export function localBoardSocket(key, seed = []) {
  let elements
  try {
    elements = JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    elements = null
  }
  if (!Array.isArray(elements)) elements = seed

  let timer = null
  const save = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify(elements)) } catch { /* full or private window: the board just isn't kept */ }
    }, 300)
  }

  return {
    connected: true,
    on() {},
    off() {},
    emit(event, ...args) {
      const ack = typeof args.at(-1) === 'function' ? args.at(-1) : null
      const element = args[0]
      switch (event) {
        case 'board:open':
          ack?.({ elements: structuredClone(elements) })
          return
        case 'board:add':
          if (!elements.some((e) => e.id === element.id)) elements.push(structuredClone(element))
          break
        case 'board:update':
          elements = elements.map((e) => (e.id === element.id ? structuredClone(element) : e))
          break
        case 'board:delete':
          elements = elements.filter((e) => e.id !== element)
          break
        case 'board:clear':
          elements = []
          break
        default:
          return
      }
      save()
    }
  }
}
