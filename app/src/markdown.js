// Lightweight Markdown renderer (no dependencies).
// Supports: # headings, paragraphs, **bold**, *italic*, `code`, ``` code blocks ```,
// bullet / numbered lists (nested by indent), > quotes, tables, --- rules, [links](url)
// Output is HTML-escaped first, so it is safe to use with dangerouslySetInnerHTML.

const escapeHtml = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export const slugify = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[`*~]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}\s-]/gu, '')
    .replace(/\s+/g, '-') || 'section'

function inline(raw) {
  const codes = []
  let s = raw.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code)
    return `\u0000${codes.length - 1}\u0000`
  })

  s = escapeHtml(s)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, '$1<em>$2</em>')
  s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, text, url) => {
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
    }
    if (url.startsWith('#')) return `<a href="${url}">${text}</a>`
    return text // ไม่อนุญาต javascript: และ scheme อื่นๆ
  })
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`)
  return s
}

const splitRow = (line) => {
  let row = line.trim()
  if (row.startsWith('|')) row = row.slice(1)
  if (row.endsWith('|')) row = row.slice(0, -1)
  return row.split('|').map((cell) => cell.trim())
}

const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const LIST_ITEM = /^(\s*)([-*+]|\d+\.)\s+(.*)$/

function renderList(items) {
  let html = ''
  const stack = []

  items.forEach((line) => {
    const m = line.match(LIST_ITEM)
    const indent = m[1].replace(/\t/g, '  ').length
    const type = /\d/.test(m[2]) ? 'ol' : 'ul'

    while (stack.length && indent < stack[stack.length - 1].indent) {
      html += `</li></${stack.pop().type}>`
    }

    // ชนิดลิสต์เปลี่ยนที่ระดับเดียวกัน (เช่น - แล้วต่อด้วย 1.) ให้ปิดแล้วเปิดลิสต์ใหม่
    if (stack.length && indent === stack[stack.length - 1].indent && stack[stack.length - 1].type !== type) {
      html += `</li></${stack.pop().type}>`
    }

    if (!stack.length || indent > stack[stack.length - 1].indent) {
      html += `<${type}><li>${inline(m[3])}`
      stack.push({ indent, type })
    } else {
      html += `</li><li>${inline(m[3])}`
    }
  })

  while (stack.length) html += `</li></${stack.pop().type}>`
  return html
}

export function renderMarkdown(src = '') {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out = []
  const headings = []
  const used = {}
  const para = []

  const flush = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join('<br />')}</p>`)
      para.length = 0
    }
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // fenced code block
    if (/^```/.test(line)) {
      flush()
      const buf = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`)
      continue
    }

    // heading
    const h = line.match(/^(#{1,4})\s+(.+?)\s*$/)
    if (h) {
      flush()
      const level = h[1].length
      const text = h[2]
      let slug = slugify(text)
      used[slug] = (used[slug] || 0) + 1
      if (used[slug] > 1) slug = `${slug}-${used[slug]}`
      const id = `doc-${slug}`
      headings.push({ level, text: text.replace(/[`*]/g, ''), id })
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`)
      i++
      continue
    }

    // horizontal rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush()
      out.push('<hr />')
      i++
      continue
    }

    // table
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flush()
      const head = splitRow(line)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitRow(lines[i]))
        i++
      }
      out.push(
        '<div class="md-table-wrap"><table><thead><tr>' +
          head.map((c) => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows
            .map(
              (r) =>
                '<tr>' +
                head.map((_, idx) => `<td>${inline(r[idx] ?? '')}</td>`).join('') +
                '</tr>',
            )
            .join('') +
          '</tbody></table></div>',
      )
      continue
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      flush()
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      out.push(`<blockquote>${buf.map(inline).join('<br />')}</blockquote>`)
      continue
    }

    // list
    if (LIST_ITEM.test(line)) {
      flush()
      const buf = []
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      out.push(renderList(buf))
      continue
    }

    // blank line
    if (!line.trim()) {
      flush()
      i++
      continue
    }

    para.push(line.trim())
    i++
  }

  flush()
  return { html: out.join('\n'), headings }
}
