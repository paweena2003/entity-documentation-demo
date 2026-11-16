// src/exportImport.js

// ---------- helpers ----------
export const safeFileName = (name = 'project') =>
  String(name).trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') || 'project'

export function downloadFile(filename, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const escXml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ---------- SQL ----------
const TYPE_MAP = {
  postgres: { varchar: 'VARCHAR(255)', int: 'INTEGER', bigint: 'BIGINT', text: 'TEXT', boolean: 'BOOLEAN',
    date: 'DATE', datetime: 'TIMESTAMP', decimal: 'NUMERIC(18,2)', uuid: 'UUID' },
  mysql: { varchar: 'VARCHAR(255)', int: 'INT', bigint: 'BIGINT', text: 'TEXT', boolean: 'TINYINT(1)',
    date: 'DATE', datetime: 'DATETIME', decimal: 'DECIMAL(18,2)', uuid: 'CHAR(36)' },
}

export function buildSql(entities, relationships, dialect = 'postgres', projectName = '') {
  const pg = dialect === 'postgres'
  const q = (id) => (pg ? `"${id}"` : `\`${id}\``)
  const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`
  const lines = [`-- ${projectName || 'Database'} (${pg ? 'PostgreSQL' : 'MySQL'})`, `-- Generated ${new Date().toISOString()}`, '']

  entities.forEach((e) => {
    const defs = e.fields.map((f) => {
      const type = TYPE_MAP[dialect][String(f.type).toLowerCase()] ?? String(f.type).toUpperCase()
      let d = `  ${q(f.name)} ${type}`
      if (f.nullable === false || f.key === 'PK') d += ' NOT NULL'
      if (f.defaultValue) d += ` DEFAULT ${f.defaultValue}`
      if (!pg && f.description) d += ` COMMENT ${sqlStr(f.description)}`
      return d
    })
    const pks = e.fields.filter((f) => f.key === 'PK').map((f) => q(f.name))
    if (pks.length) defs.push(`  PRIMARY KEY (${pks.join(', ')})`)
    e.fields.filter((f) => f.key === 'UK').forEach((f) => defs.push(`  UNIQUE (${q(f.name)})`))
    lines.push(`CREATE TABLE ${q(e.name)} (`, defs.join(',\n'), ');', '')

    if (pg) {
      if (e.description) lines.push(`COMMENT ON TABLE ${q(e.name)} IS ${sqlStr(e.description)};`)
      e.fields.filter((f) => f.description).forEach((f) =>
        lines.push(`COMMENT ON COLUMN ${q(e.name)}.${q(f.name)} IS ${sqlStr(f.description)};`))
      lines.push('')
    }
  })

  relationships.forEach((r, i) => {
    // many-side ถือ FK: 1:N → toEntity ถือ FK
    lines.push(
      `ALTER TABLE ${q(r.toEntity)} ADD CONSTRAINT ${q(`fk_${r.toEntity}_${r.toField}_${i + 1}`)} ` +
      `FOREIGN KEY (${q(r.toField)}) REFERENCES ${q(r.fromEntity)} (${q(r.fromField)});`,
    )
  })
  return lines.join('\n') + '\n'
}

// ---------- CSV ----------
const HEADER = ['Entity', 'Field', 'Type', 'Key', 'Nullable', 'Default', 'Description']

export function buildDictionaryCsv(entities) {
  const rows = [HEADER]
  entities.forEach((e) =>
    e.fields.forEach((f) =>
      rows.push([e.name, f.name, f.type, f.key ?? '', f.nullable === false ? 'NO' : 'YES', f.defaultValue ?? '', f.description ?? '']),
    ),
  )
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function buildImportTemplate() {
  const rows = [
    HEADER,
    ['USERS', 'id', 'int', 'PK', 'NO', '', 'รหัสผู้ใช้'],
    ['USERS', 'username', 'varchar', '', 'NO', '', 'ชื่อผู้ใช้'],
    ['POSTS', 'user_id', 'int', 'FK', 'YES', '', 'ผู้สร้างโพสต์'],
  ]
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

function parseCsvText(text) {
  const rows = []
  let row = [], cell = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') inQ = false
      else cell += c
    } else if (c === '"') inQ = true
    else if (c === ',' || c === '\t') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

const TYPES = ['varchar', 'int', 'bigint', 'text', 'boolean', 'date', 'datetime', 'decimal', 'uuid']
const FALSY = ['no', 'n', 'false', '0', 'not null', 'notnull']

export function parseImportCsv(text) {
  const warnings = []
  const table = parseCsvText(text.replace(/^\uFEFF/, ''))
  if (table.length < 2) return { rows: [], warnings, error: 'ไม่พบข้อมูลในไฟล์ (ต้องมีหัวตารางและอย่างน้อย 1 แถว)' }

  const head = table[0].map((h) => h.trim().toLowerCase())
  const idx = (name) => head.indexOf(name)
  const iE = idx('entity'), iF = idx('field')
  if (iE < 0 || iF < 0) return { rows: [], warnings, error: 'ไม่พบคอลัมน์ Entity และ Field ในหัวตาราง' }
  const iT = idx('type'), iK = idx('key'), iN = idx('nullable'), iD = idx('default'), iDs = idx('description')

  const rows = []
  table.slice(1).forEach((r, n) => {
    const line = n + 2
    const entity = (r[iE] ?? '').trim()
    const field = (r[iF] ?? '').trim()
    if (!entity || !field) { warnings.push(`แถว ${line}: ไม่มีชื่อ Entity หรือ Field — ข้าม`); return }
    let type = (iT >= 0 ? r[iT] ?? '' : '').trim().toLowerCase().replace(/\(.*\)/, '')
    if (!TYPES.includes(type)) {
      if (type) warnings.push(`แถว ${line}: ชนิดข้อมูล "${type}" ไม่รู้จัก ใช้ varchar แทน`)
      type = 'varchar'
    }
    let key = (iK >= 0 ? r[iK] ?? '' : '').trim().toUpperCase()
    if (!['PK', 'FK', 'UK'].includes(key)) key = ''
    const nullable = iN < 0 ? true : !FALSY.includes((r[iN] ?? '').trim().toLowerCase())
    rows.push({
      entity, field, type, key, nullable,
      defaultValue: iD >= 0 ? (r[iD] ?? '').trim() : '',
      description: iDs >= 0 ? (r[iDs] ?? '').trim() : '',
    })
  })
  return { rows, warnings }
}

export function mergeImport(entities, rows, makeEntity) {
  const next = entities.map((e) => ({ ...e, fields: [...e.fields] }))
  let addedEntities = 0, addedFields = 0, skippedFields = 0

  rows.forEach((r) => {
    let ent = next.find((e) => e.name.toLowerCase() === r.entity.toLowerCase())
    if (!ent) {
      ent = makeEntity(r.entity, next.length)
      ent.fields = []
      next.push(ent)
      addedEntities++
    }
    if (ent.fields.some((f) => f.name.toLowerCase() === r.field.toLowerCase())) { skippedFields++; return }
    ent.fields.push({
      name: r.field, type: r.type, key: r.key, nullable: r.nullable,
      defaultValue: r.defaultValue, description: r.description,
    })
    addedFields++
  })
  return { entities: next, addedEntities, addedFields, skippedFields }
}

// ---------- Diagram export ----------
export function diagramToSvg(diagram, layout) {
  const { NODE_W, HEADER_H, ROW_H, COLOR_HEX, COLOR_TINT } = layout
  const font = "font-family=\"'Segoe UI','Noto Sans Thai',Tahoma,sans-serif\""
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${diagram.width}" height="${diagram.height}" viewBox="0 0 ${diagram.width} ${diagram.height}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
  ]

  diagram.edges.forEach((e) => {
    out.push(`<path d="${e.d}" stroke="${e.color}" stroke-width="2" fill="none"/>`)
    out.push(`<circle cx="${e.ax}" cy="${e.ay}" r="3.5" fill="${e.color}"/>`)
    out.push(`<circle cx="${e.bx}" cy="${e.by}" r="3.5" fill="${e.color}"/>`)
    out.push(`<text x="${e.ax + e.dirA * 14}" y="${e.ay - 6}" font-size="11" font-weight="700" text-anchor="middle" fill="${e.color}" ${font}>${escXml(e.fromCard)}</text>`)
    out.push(`<text x="${e.bx + e.dirB * 14}" y="${e.by - 6}" font-size="11" font-weight="700" text-anchor="middle" fill="${e.color}" ${font}>${escXml(e.toCard)}</text>`)
    if (e.label) out.push(`<text x="${e.mx}" y="${e.my - 6}" font-size="11" text-anchor="middle" fill="${e.color}" ${font}>${escXml(e.label)}</text>`)
  })

  diagram.nodes.forEach(({ entity, x, y }) => {
    const hex = COLOR_HEX[entity.color] ?? COLOR_HEX.blue
    const tint = COLOR_TINT[entity.color] ?? COLOR_TINT.blue
    const rows = Math.max(entity.fields.length, 1)
    const h = HEADER_H + rows * ROW_H
    out.push(`<rect x="${x}" y="${y}" width="${NODE_W}" height="${h}" rx="10" fill="#fff" stroke="${hex}" stroke-width="1.5"/>`)
    out.push(`<path d="M ${x} ${y + HEADER_H} V ${y + 10} Q ${x} ${y} ${x + 10} ${y} H ${x + NODE_W - 10} Q ${x + NODE_W} ${y} ${x + NODE_W} ${y + 10} V ${y + HEADER_H} Z" fill="${tint}"/>`)
    out.push(`<text x="${x + 14}" y="${y + HEADER_H / 2 + 5}" font-size="14" font-weight="700" fill="${hex}" ${font}>${escXml(entity.name)}</text>`)
    out.push(`<text x="${x + NODE_W - 14}" y="${y + HEADER_H / 2 + 4}" font-size="11" text-anchor="end" fill="${hex}" ${font}>${entity.fields.length} fields</text>`)

    if (entity.fields.length === 0) {
      out.push(`<text x="${x + 14}" y="${y + HEADER_H + ROW_H / 2 + 4}" font-size="12" fill="#9aa3b5" ${font}>No columns yet</text>`)
    }
    entity.fields.forEach((f, i) => {
      const ry = y + HEADER_H + i * ROW_H
      out.push(`<line x1="${x}" y1="${ry}" x2="${x + NODE_W}" y2="${ry}" stroke="#eef0f5"/>`)
      const mark = f.key === 'PK' ? 'PK' : f.key === 'FK' ? 'FK' : '•'
      out.push(`<text x="${x + 14}" y="${ry + ROW_H / 2 + 4}" font-size="10" font-weight="700" fill="${hex}" ${font}>${mark}</text>`)
      out.push(`<text x="${x + 36}" y="${ry + ROW_H / 2 + 4}" font-size="12.5" font-weight="600" fill="#2b3348" ${font}>${escXml(f.name)}</text>`)
      out.push(`<text x="${x + NODE_W - 14}" y="${ry + ROW_H / 2 + 4}" font-size="11" text-anchor="end" fill="#7b869c" ${font}>${escXml(f.type)}${f.key ? ` · ${escXml(f.key)}` : ''}</text>`)
    })
  })

  out.push('</svg>')
  return out.join('\n')
}

export function svgToPngBlob(svgText, width, height, scale = 2) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }))
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width * scale
      canvas.height = height * scale
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('สร้างไฟล์ภาพไม่สำเร็จ'))), 'image/png')
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('แปลง SVG เป็นภาพไม่สำเร็จ')) }
    img.src = url
  })
}