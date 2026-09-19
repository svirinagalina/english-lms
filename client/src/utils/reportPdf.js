// Turns the rendered report into an A4 PDF: the page is drawn with
// html2canvas (so fonts, Cyrillic and the layout come out exactly as on
// screen) and sliced into pages.
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

  let y = 0
  let first = true
  while (y < canvas.height) {
    const h = Math.min(sliceHeightPx, canvas.height - y)
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
    y += h
  }
  pdf.save(fileName)
}
