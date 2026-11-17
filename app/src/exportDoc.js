// ส่งออกหน้า Documentation เป็น PDF / Word (ไม่ต้องติดตั้งไลบรารีเพิ่ม)
// - PDF  : เปิดหน้าต่างพิมพ์ของเบราว์เซอร์ แล้วเลือก "Save as PDF"
// - Word : สร้างไฟล์ .doc (HTML ที่ Word เปิดได้) ภาษาไทยแสดงถูกต้อง
// docs = [{ title, content }, ...]   (ส่ง 1 หน้า หรือหลายหน้ารวมเป็นไฟล์เดียว)

import { renderMarkdown } from './markdown'
import { downloadFile, safeFileName } from './exportImport'

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: 'Noto Sans Thai', 'Sarabun', Tahoma, 'Segoe UI', Arial, sans-serif;
         font-size: 11pt; line-height: 1.7; color: #1f2937; }
  h1 { font-size: 22pt; margin: 0 0 10pt; color: #111827; }
  h2 { font-size: 16pt; margin: 18pt 0 6pt; padding-bottom: 3pt; border-bottom: 1px solid #e5e7eb; color: #111827; }
  h3 { font-size: 13pt; margin: 14pt 0 5pt; color: #111827; }
  h4 { font-size: 11.5pt; margin: 12pt 0 4pt; }
  p { margin: 0 0 8pt; }
  ul, ol { margin: 0 0 10pt; padding-left: 22pt; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0 12pt; }
  th, td { border: 1px solid #cbd5e1; padding: 4pt 6pt; vertical-align: top; text-align: left; font-size: 10pt; }
  th { background: #f1f5f9; }
  code { font-family: Consolas, 'Courier New', monospace; font-size: 10pt; background: #f3f4f6; padding: 0 2pt; }
  pre { background: #f3f4f6; border: 1px solid #e5e7eb; padding: 8pt; margin: 0 0 10pt;
        white-space: pre-wrap; word-wrap: break-word; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 0 0 10pt; padding: 6pt 12pt; border-left: 3px solid #a5b4fc; background: #f5f7ff; }
  hr { border: 0; border-top: 1px solid #e5e7eb; margin: 14pt 0; }
  a { color: #4338ca; }
  .muted { color: #6b7280; font-size: 10pt; }
  tr, pre, blockquote { page-break-inside: avoid; }
  h1, h2, h3, h4 { page-break-after: avoid; }
`

function buildHtml(docs, projectName, forWord) {
  const multi = docs.length > 1
  const title = multi ? projectName || 'Documentation' : docs[0]?.title || 'Document'

  const cover = multi
    ? `<h1>${esc(projectName || 'Documentation')}</h1>
       <p class="muted">${docs.length} หน้า · ส่งออกเมื่อ ${esc(new Date().toLocaleDateString('th-TH'))}</p>
       <ol>${docs.map((d) => `<li>${esc(d.title)}</li>`).join('')}</ol>`
    : ''

  const body = docs
    .map((d, i) => {
      const { html } = renderMarkdown(d.content ?? '')
      const breakBefore = i > 0 || multi ? ' style="page-break-before:always"' : ''
      return `<section${breakBefore}><h1>${esc(d.title)}</h1>${html}</section>`
    })
    .join('\n')

  const head = forWord
    ? `<meta charset="utf-8"><title>${esc(title)}</title>
       <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->`
    : `<meta charset="utf-8"><title>${esc(title)}</title>
       <link rel="preconnect" href="https://fonts.googleapis.com">
       <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700&display=swap">`

  const ns = forWord
    ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"'
    : ''

  return `<!DOCTYPE html><html lang="th"${ns}><head>${head}<style>${CSS}</style></head><body>${cover}${body}</body></html>`
}

export function exportWord(docs, projectName = '') {
  if (!docs.length) return
  const name = docs.length === 1 ? docs[0].title : `${projectName || 'project'}_documentation`
  // ใส่ BOM เพื่อให้ Word อ่านภาษาไทยถูกต้อง
  downloadFile(`${safeFileName(name)}.doc`, '\ufeff' + buildHtml(docs, projectName, true), 'application/msword')
}

export function exportPdf(docs, projectName = '') {
  if (!docs.length) return
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'

  frame.onload = () => {
    const win = frame.contentWindow
    if (!win) return
    const go = () => {
      win.onafterprint = () => frame.remove()
      win.focus()
      win.print()
    }
    // รอฟอนต์ไทยโหลดก่อนพิมพ์
    const ready = win.document.fonts?.ready ?? Promise.resolve()
    ready.then(() => setTimeout(go, 300))
  }

  document.body.appendChild(frame)
  frame.srcdoc = buildHtml(docs, projectName, false)
  setTimeout(() => frame.remove(), 5 * 60 * 1000)
}