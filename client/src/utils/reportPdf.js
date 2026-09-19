// Turns the rendered report into an A4 PDF: the page is drawn with
// html2canvas (so fonts, Cyrillic and the layout come out exactly as on
// screen) and sliced into pages — cutting only through empty rows, so no
// line of text is split between two pages.
export async function downloadReportPdf(element, fileName) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const scale = 2
  const canvas = await html2canvas(element, { scale, backgroundColor: '#fcfbf6', useCORS: true, logging: false, windowWidth: element.scrollWidth })
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 8
  const innerW = pageW - margin * 2
  const innerH = pageH - margin * 2
  const pxPerMm = canvas.width / innerW
  const sliceHeightPx = Math.floor(innerH * pxPerMm)

  // A small greyscale copy to find blank rows cheaply.
  const probe = document.createElement('canvas')
  const probeW = 160
  probe.width = probeW
  probe.height = canvas.height
  const pctx = probe.getContext('2d', { willReadFrequently: true })
  pctx.drawImage(canvas, 0, 0, probeW, canvas.height)
  const rowIsBlank = (y) => {
    const { data } = pctx.getImageData(0, y, probeW, 1)
    for (let i = 0; i < data.length; i += 4) {
      // Anything darker than the ivory paper (borders, text, badges) counts as ink.
      if (data[i] < 236 || data[i + 1] < 236 || data[i + 2] < 226) return false
    }
    return true
  }
  // Prefer a cut inside a blank band at least a few pixels tall, within the
  // last quarter of the page; otherwise the nearest blank row; otherwise the ideal.
  const cutBelow = (start) => {
    const ideal = Math.min(start + sliceHeightPx, canvas.height)
    if (ideal === canvas.height) return ideal
    const minY = start + Math.floor(sliceHeightPx * 0.6)
    let run = 0
    for (let y = ideal; y > minY; y--) {
      if (rowIsBlank(y)) { run++; if (run >= 6) return y + 3 } else run = 0
    }
    for (let y = ideal; y > minY; y--) if (rowIsBlank(y)) return y
    return ideal
  }

  let y = 0
  let first = true
  while (y < canvas.height) {
    const end = cutBelow(y)
    const h = end - y
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = h
    const ctx = slice.getContext('2d')
    ctx.fillStyle = '#fcfbf6'
    ctx.fillRect(0, 0, slice.width, slice.height)
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
    if (!first) pdf.addPage()
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, innerW, h / pxPerMm)
    first = false
    y = end
  }
  pdf.save(fileName)
}
