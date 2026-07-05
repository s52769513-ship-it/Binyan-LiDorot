/**
 * עזרי ייצוא משותפים: אקסל / PDF / הדפסה.
 *
 * PDF ו-הדפסה עובדים על אלמנט HTML קיים (html2canvas → jsPDF) כדי לשמר עברית
 * ו-RTL; אקסל בונה גיליון מתוך מערך שורות. הספריות נטענות דינמית כדי לא
 * להכביד על טעינת הדף.
 */

export type ExportRow = Record<string, string | number>

/** מוריד מערך שורות כקובץ אקסל (.xlsx). המפתחות של השורה הראשונה = כותרות. */
export async function exportRowsToExcel(rows: ExportRow[], filename: string, sheetName = 'נתונים') {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

/** ממיר אלמנט ל-PDF (A4) ושומר. משמר עברית ע"י צילום ל-canvas. */
export async function exportElementToPDF(el: HTMLElement, filename: string) {
  const [{ jsPDF }, html2canvas] = await Promise.all([
    import('jspdf'),
    import('html2canvas').then(m => m.default),
  ])
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' })
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const imgW = 210
  const pageH = 297
  const pxPerMm = canvas.width / imgW
  const pageHpx = pageH * pxPerMm
  let y = 0
  let first = true
  while (y < canvas.height) {
    if (!first) pdf.addPage()
    first = false
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = Math.min(pageHpx, canvas.height - y)
    const ctx = slice.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, slice.width, slice.height)
      ctx.drawImage(canvas, 0, -y)
    }
    const sliceHmm = slice.height / pxPerMm
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, sliceHmm)
    y += pageHpx
  }
  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}

/** פותח חלון הדפסה עם תוכן האלמנט (RTL, עברית). */
export function printElement(el: HTMLElement, title: string) {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${title}</title>
    <style>
      * { font-family: Arial, 'Segoe UI', sans-serif; box-sizing: border-box; }
      body { margin: 24px; color: #111; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: right; }
      thead th { background: #f3f4f6; }
      h1 { font-size: 18px; margin: 0 0 12px; }
      .tot { font-weight: 700; }
      @media print { body { margin: 0; } }
    </style></head><body>${el.outerHTML}</body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 400)
}
