// Export / Import helpers (no dependencies)
// - SQL script (PostgreSQL / MySQL)
// - Data Dictionary CSV (+ CSV import template and parser)
// - ER Diagram → SVG / PNG

// ===== common =====
const oneLine = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim()

export const safeFileName = (name) =>
  String(name ?? 'export').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'export'

export function downloadFile(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ===== CSV =====
// กันสูตร Excel (=, @, +, -) ที่อาจถูกรันเมื่อเปิดไฟล์ CSV
const csvCell = (value) => {
  let s = String(value ?? '')
  if (/^[=@]/.test(s) || /^[+-][^0-9.\s]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ใส่ BOM เพื่อให้ Excel อ่านภาษาไทยถูกต้อง
export const toCsv = (rows) => '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

const DICT_HEADER = ['Entity', 'Field', 'Type', 'Key', 'Nullable', 'Default', 'Description', 'References']

export function buildDictionaryCsv(entities, relationships = []) {
  const rows = [DICT_HEADER]
  entities.forEach((entity) => {
    entity.fields.forEach((f) => {
      const rel = relationships.find((r) => r.toEntity === entity.name && r.toField === f.name)
      rows.push([
        entity.name,
        f.name,
        f.type,
        f.key || '',
        f.nullable === false ? 'NOT NULL' : 'NULL',
        f.defaultValue || '',
        f.description || '',
        rel ? `${rel.fromEntity}.${rel.fromField}` : '',
      ])
    })
  })
  return toCsv(rows)
}

export function buildImportTemplate() {
  return toCsv([
    DICT_HEADER.slice(0, 7),
    ['USERS', 'id', 'int', 'PK', 'NOT NULL', '', 'รหัสผู้ใช้'],
    ['USERS', 'username', 'varchar', '', 'NOT NULL', '', 'ชื่อผู้ใช้'],
    ['POSTS', 'id', 'int', 'PK', 'NOT NULL', '', 'รหัสโพสต์'],
    ['POSTS', 'user_id', 'int', 'FK', 'NOT NULL', '', 'ผู้สร้างโพสต์'],
  ])
}

export function parseCsv(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '')
  const firstLine = src.split(/\r\n|\n|\r/)[0] ?? ''
  const count = (ch) => (firstLine.match(new RegExp(`\\${ch}`, 'g')) || []).length
  let delim = ','
  if (count(';') > count(',') && count(';') >= count('\t')) delim = ';'
  else if (count('\t') > count(',')) delim = '\t'

  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  const pushRow = () => {
    row.push(cell)
    cell = ''
    if (row.some((x) => x.trim() !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delim) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      pushRow()
    } else {
      cell += c
    }
  }
  if (cell !== '' || row.length) pushRow()
  return rows
}

const VALID_TYPES = ['varchar', 'int', 'bigint', 'text', 'boolean', 'date', 'datetime', 'decimal', 'uuid']
const TYPE_ALIASES = {
  string: 'varchar',
  char: 'varchar',
  integer: 'int',
  number: 'int',
  timestamp: 'datetime',
  timestamptz: 'datetime',
  bool: 'boolean',
  numeric: 'decimal',
  float: 'decimal',
  double: 'decimal',
  json: 'text',
  jsonb: 'text',
}
const KEY_ALIASES = {
  PK: 'PK',
  'PRIMARY KEY': 'PK',
  FK: 'FK',
  'FOREIGN KEY': 'FK',
  UK: 'UK',
  UNIQUE: 'UK',
}
const MAX_IMPORT_ROWS = 5000

const clean = (v) => String(v ?? '').trim().replace(/^'(?=[=@+-])/, '')

export function parseImportCsv(text) {
  const grid = parseCsv(text)
  if (grid.length < 2) return { rows: [], warnings: [], error: 'ไฟล์ว่าง หรือมีแต่หัวตาราง' }
  if (grid.length - 1 > MAX_IMPORT_ROWS) {
    return { rows: [], warnings: [], error: `ไฟล์มีมากกว่า ${MAX_IMPORT_ROWS} แถว กรุณาแบ่งไฟล์ก่อนนำเข้า` }
  }

  const header = grid[0].map((h) => String(h).trim().toLowerCase().replace(/\s+/g, ' '))
  const find = (names) => header.findIndex((h) => names.includes(h))
  const idx = {
    entity: find(['entity', 'table', 'table_name', 'entity name']),
    field: find(['field', 'column', 'column_name', 'name', 'field name']),
    type: find(['type', 'data type', 'datatype', 'data_type']),
    key: find(['key']),
    nullable: find(['nullable', 'null', 'is_nullable']),
    defaultValue: find(['default', 'default value', 'default_value']),
    description: find(['description', 'desc', 'comment']),
  }

  if (idx.entity < 0 || idx.field < 0) {
    return {
      rows: [],
      warnings: [],
      error: 'ไม่พบหัวคอลัมน์ Entity และ Field ในแถวแรกของไฟล์ (ดาวน์โหลดเทมเพลตเพื่อดูรูปแบบ)',
    }
  }

  const get = (row, i) => (i < 0 ? '' : clean(row[i]))
  const rows = []
  const warnings = []

  grid.slice(1).forEach((row, n) => {
    const line = n + 2
    const entity = get(row, idx.entity)
    const field = get(row, idx.field)
    if (!entity || !field) {
      warnings.push(`แถว ${line}: ไม่มีชื่อ Entity หรือ Field จึงข้าม`)
      return
    }

    let type = get(row, idx.type).toLowerCase().replace(/\(.*\)/, '').trim()
    type = TYPE_ALIASES[type] ?? type
    if (!type) {
      type = 'varchar'
    } else if (!VALID_TYPES.includes(type)) {
      warnings.push(`แถว ${line}: ไม่รู้จัก type "${get(row, idx.type)}" จึงใช้ varchar แทน`)
      type = 'varchar'
    }

    const keyRaw = get(row, idx.key).toUpperCase()
    const key = KEY_ALIASES[keyRaw] ?? ''
    if (keyRaw && !key) warnings.push(`แถว ${line}: ไม่รู้จัก key "${get(row, idx.key)}" จึงเว้นว่าง`)

    const nullableRaw = get(row, idx.nullable).toLowerCase()
    const nullable = !['not null', 'not_null', 'no', 'false', '0', 'n', 'f'].includes(nullableRaw)

    rows.push({
      entity,
      field,
      type,
      key,
      nullable,
      defaultValue: get(row, idx.defaultValue),
      description: get(row, idx.description),
    })
  })

  return { rows, warnings, error: null }
}

// รวมแถวที่นำเข้ากับ Entity เดิม: ถ้ามี Entity/Column ชื่อซ้ำ (ไม่สนตัวพิมพ์) จะข้าม ไม่เขียนทับ
export function mergeImport(current, rows, makeEntity) {
  const entities = current.map((e) => ({ ...e, fields: [...e.fields] }))
  let addedEntities = 0
  let addedFields = 0
  let skippedFields = 0

  rows.forEach((r) => {
    let entity = entities.find((x) => x.name.toLowerCase() === r.entity.toLowerCase())
    if (!entity) {
      entity = makeEntity(r.entity, entities.length)
      entities.push(entity)
      addedEntities++
    }
    if (entity.fields.some((f) => f.name.toLowerCase() === r.field.toLowerCase())) {
      skippedFields++
      return
    }
    entity.fields.push({
      name: r.field,
      type: r.type,
      key: r.key,
      nullable: r.nullable,
      defaultValue: r.defaultValue,
      description: r.description,
    })
    addedFields++
  })

  return { entities, addedEntities, addedFields, skippedFields }
}

// ===== SQL =====
const SQL_TYPES = {
  postgres: {
    varchar: 'VARCHAR(255)',
    string: 'VARCHAR(255)',
    int: 'INTEGER',
    integer: 'INTEGER',
    bigint: 'BIGINT',
    text: 'TEXT',
    boolean: 'BOOLEAN',
    date: 'DATE',
    datetime: 'TIMESTAMP',
    decimal: 'NUMERIC(18,2)',
    uuid: 'UUID',
  },
  mysql: {
    varchar: 'VARCHAR(255)',
    string: 'VARCHAR(255)',
    int: 'INT',
    integer: 'INT',
    bigint: 'BIGINT',
    text: 'TEXT',
    boolean: 'TINYINT(1)',
    date: 'DATE',
    datetime: 'DATETIME',
    decimal: 'DECIMAL(18,2)',
    uuid: 'CHAR(36)',
  },
}

const quoteId = (d, name) =>
  d === 'mysql'
    ? '`' + oneLine(name).replace(/`/g, '``') + '`'
    : '"' + oneLine(name).replace(/"/g, '""') + '"'

const lit = (d, value) => {
  let s = String(value ?? '')
  if (d === 'mysql') s = s.replace(/\\/g, '\\\\')
  return "'" + s.replace(/'/g, "''") + "'"
}

const sqlType = (d, type) => SQL_TYPES[d][String(type || '').toLowerCase()] ?? 'VARCHAR(255)'

// คืน null ถ้าไม่ต้องใส่ DEFAULT
const sqlDefault = (d, raw) => {
  const v = String(raw ?? '').trim()
  if (!v || /^null$/i.test(v)) return null
  if (/^-?\d+(\.\d+)?$/.test(v)) return v
  if (/^(true|false)$/i.test(v)) return v.toUpperCase()
  if (/^(current_timestamp(\(\))?|now\(\)|gen_random_uuid\(\)|uuid\(\))$/i.test(v)) return v
  if (/^'.*'$/s.test(v)) return v
  return lit(d, v)
}

const shortName = (...parts) =>
  parts
    .map((p) => oneLine(p))
    .join('_')
    .replace(/[^\p{L}\p{N}_]+/gu, '_')
    .slice(0, 60)

export function buildSql(entities, relationships = [], dialect = 'postgres', projectName = '') {
  const d = dialect === 'mysql' ? 'mysql' : 'postgres'
  const q = (name) => quoteId(d, name)
  const lines = []

  lines.push('-- Generated by Entity Portal')
  if (projectName) lines.push(`-- Project: ${oneLine(projectName)}`)
  lines.push(`-- Dialect: ${d === 'mysql' ? 'MySQL / MariaDB' : 'PostgreSQL'}`)
  lines.push(`-- Generated at: ${new Date().toISOString()}`)
  lines.push('')

  const byName = new Map(entities.map((e) => [e.name, e]))

  entities.forEach((entity) => {
    if (!entity.fields.length) {
      lines.push(`-- TABLE ${oneLine(entity.name)} has no columns and was skipped`, '')
      return
    }

    const defs = []
    const pkCols = entity.fields.filter((f) => f.key === 'PK')

    entity.fields.forEach((f) => {
      const notNull = f.nullable === false || f.key === 'PK'
      let def = `  ${q(f.name)} ${sqlType(d, f.type)}`
      if (notNull) def += ' NOT NULL'
      const dv = sqlDefault(d, f.defaultValue)
      if (dv !== null) def += ` DEFAULT ${dv}`
      if (d === 'mysql' && f.description) def += ` COMMENT ${lit(d, f.description)}`
      defs.push(def)
    })

    if (pkCols.length) defs.push(`  PRIMARY KEY (${pkCols.map((f) => q(f.name)).join(', ')})`)
    entity.fields
      .filter((f) => f.key === 'UK')
      .forEach((f) => defs.push(`  CONSTRAINT ${q(shortName('uq', entity.name, f.name))} UNIQUE (${q(f.name)})`))

    lines.push(`CREATE TABLE ${q(entity.name)} (`)
    lines.push(defs.join(',\n'))
    lines.push(d === 'mysql' && entity.description ? `) COMMENT=${lit(d, entity.description)};` : ');')

    if (d === 'postgres') {
      if (entity.description) {
        lines.push(`COMMENT ON TABLE ${q(entity.name)} IS ${lit(d, entity.description)};`)
      }
      entity.fields.forEach((f) => {
        if (f.description) {
          lines.push(`COMMENT ON COLUMN ${q(entity.name)}.${q(f.name)} IS ${lit(d, f.description)};`)
        }
      })
    }
    lines.push('')
  })

  const fkLines = []
  relationships.forEach((rel, i) => {
    const label = oneLine(`${rel.fromEntity}.${rel.fromField} -> ${rel.toEntity}.${rel.toField}`)
    const parent = byName.get(rel.fromEntity)
    const child = byName.get(rel.toEntity)
    const parentField = parent?.fields.find((f) => f.name === rel.fromField)
    const childField = child?.fields.find((f) => f.name === rel.toField)

    if (!parentField || !childField) {
      fkLines.push(`-- skipped (entity or column not found): ${label}`)
      return
    }
    if (rel.type === 'N:M') {
      fkLines.push(`-- skipped N:M (needs a junction table): ${label}`)
      return
    }

    const parentPkCount = parent.fields.filter((f) => f.key === 'PK').length
    const referencable =
      (parentField.key === 'PK' && parentPkCount === 1) || parentField.key === 'UK'
    if (!referencable) {
      fkLines.push(
        `-- WARNING: ${oneLine(rel.fromEntity)}.${oneLine(rel.fromField)} is not a single-column PK/UK; the database may reject this foreign key`,
      )
    }
    fkLines.push(
      `ALTER TABLE ${q(child.name)} ADD CONSTRAINT ${q(shortName('fk', i + 1, child.name, rel.toField))} ` +
        `FOREIGN KEY (${q(rel.toField)}) REFERENCES ${q(parent.name)} (${q(rel.fromField)});`,
    )
  })

  if (fkLines.length) lines.push('-- Foreign keys', ...fkLines, '')

  return lines.join('\n')
}

// ===== ER Diagram → SVG / PNG =====
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const clip = (s, max) => (String(s).length > max ? `${String(s).slice(0, max - 1)}…` : String(s))

export function diagramToSvg(diagram, layout) {
  const { NODE_W, HEADER_H, ROW_H, COLOR_HEX, COLOR_TINT } = layout
  const W = Math.ceil(diagram.width)
  const H = Math.ceil(diagram.height)
  const out = []

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ` +
      `font-family="Inter, 'Noto Sans Thai', 'Segoe UI', Arial, sans-serif">`,
  )
  out.push(`<rect width="${W}" height="${H}" fill="#fafaff"/>`)

  diagram.edges.forEach((edge) => {
    const c = edge.color
    out.push(`<path d="${edge.d}" stroke="${c}" stroke-width="2" fill="none"/>`)
    out.push(`<circle cx="${edge.ax}" cy="${edge.ay}" r="3.5" fill="${c}"/>`)
    out.push(`<circle cx="${edge.bx}" cy="${edge.by}" r="3.5" fill="${c}"/>`)
    out.push(
      `<text x="${edge.ax + edge.dirA * 14}" y="${edge.ay - 6}" font-size="11" font-weight="700" text-anchor="middle" fill="${c}">${esc(edge.fromCard)}</text>`,
    )
    out.push(
      `<text x="${edge.bx + edge.dirB * 14}" y="${edge.by - 6}" font-size="11" font-weight="700" text-anchor="middle" fill="${c}">${esc(edge.toCard)}</text>`,
    )
    if (edge.label) {
      const w = edge.label.length * 6.5 + 18
      out.push(
        `<rect x="${edge.mx - w / 2}" y="${edge.my - 11}" width="${w}" height="22" rx="11" fill="#fff" stroke="${c}" stroke-width="1"/>`,
      )
      out.push(
        `<text x="${edge.mx}" y="${edge.my + 4}" font-size="10.5" text-anchor="middle" fill="${c}">${esc(edge.label)}</text>`,
      )
    }
  })

  diagram.nodes.forEach(({ entity, x, y }, i) => {
    const hex = COLOR_HEX[entity.color] ?? COLOR_HEX.blue
    const tint = COLOR_TINT[entity.color] ?? COLOR_TINT.blue
    const rows = Math.max(entity.fields.length, 1)
    const h = HEADER_H + rows * ROW_H

    out.push(`<clipPath id="clip${i}"><rect x="${x}" y="${y}" width="${NODE_W}" height="${h}" rx="12"/></clipPath>`)
    out.push(`<rect x="${x}" y="${y}" width="${NODE_W}" height="${h}" rx="12" fill="#fff"/>`)
    out.push(`<g clip-path="url(#clip${i})">`)
    out.push(`<rect x="${x}" y="${y}" width="${NODE_W}" height="${HEADER_H}" fill="${tint}"/>`)
    out.push(
      `<text x="${x + 14}" y="${y + HEADER_H / 2 + 4}" font-size="12" font-weight="700" fill="${hex}">${esc(clip(entity.name, 26))}</text>`,
    )
    out.push(
      `<text x="${x + NODE_W - 12}" y="${y + HEADER_H / 2 + 3.5}" font-size="10" text-anchor="end" fill="#8791a4">${entity.fields.length} fields</text>`,
    )

    if (!entity.fields.length) {
      out.push(
        `<text x="${x + NODE_W / 2}" y="${y + HEADER_H + ROW_H / 2 + 3.5}" font-size="10" text-anchor="middle" fill="#a5adbb">No columns yet</text>`,
      )
    }

    entity.fields.forEach((f, j) => {
      const ry = y + HEADER_H + j * ROW_H
      const mid = ry + ROW_H / 2 + 3.5
      out.push(`<line x1="${x}" y1="${ry}" x2="${x + NODE_W}" y2="${ry}" stroke="#f0f2f7"/>`)
      if (f.key === 'PK' || f.key === 'FK' || f.key === 'UK') {
        const color = f.key === 'PK' ? '#4e78d5' : f.key === 'FK' ? '#169777' : '#b7791f'
        out.push(`<text x="${x + 12}" y="${mid}" font-size="8" font-weight="800" fill="${color}">${f.key}</text>`)
      } else {
        out.push(`<text x="${x + 14}" y="${mid}" font-size="11" fill="#a5adbb">•</text>`)
      }
      out.push(
        `<text x="${x + 34}" y="${mid}" font-size="10" font-family="Consolas, 'Courier New', monospace" fill="#48546d">${esc(clip(f.name, 22))}</text>`,
      )
      out.push(
        `<text x="${x + NODE_W - 12}" y="${mid}" font-size="10" text-anchor="end" fill="#969fb0">${esc(f.type)}</text>`,
      )
    })

    out.push('</g>')
    out.push(
      `<rect x="${x}" y="${y}" width="${NODE_W}" height="${h}" rx="12" fill="none" stroke="${hex}" stroke-width="1.5"/>`,
    )
  })

  out.push('</svg>')
  return out.join('\n')
}

export function svgToPngBlob(svgString, width, height, scale = 2) {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(width * scale)
        canvas.height = Math.ceil(height * scale)
        const ctx = canvas.getContext('2d')
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0, width, height)
        URL.revokeObjectURL(url)
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('สร้างไฟล์ภาพไม่สำเร็จ'))), 'image/png')
      } catch (error) {
        URL.revokeObjectURL(url)
        reject(error)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('โหลดภาพ SVG ไม่สำเร็จ'))
    }
    img.src = url
  })
}