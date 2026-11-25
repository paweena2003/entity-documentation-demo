/* ======================================================================
   ioMapping.js — ตัวช่วยสำหรับ Import แบบจับคู่คอลัมน์ และ Export แบบเปลี่ยนชื่อหัวคอลัมน์
   ไม่พึ่งไฟล์อื่นในโปรเจกต์ (pure functions)
   ====================================================================== */

// ===== ฟิลด์ปลายทางของ Entity Portal =====
export const TARGET_FIELDS = [
  { key: 'entity', label: 'Entity (ชื่อตาราง)', hint: 'ถ้าไฟล์ไม่มีคอลัมน์นี้ จะใช้ชื่อที่กรอกด้านล่างแทน' },
  { key: 'field', label: 'Field (ชื่อคอลัมน์)', required: true },
  { key: 'type', label: 'Type (ชนิดข้อมูล)' },
  { key: 'key', label: 'Key (PK / FK / UK)' },
  { key: 'nullable', label: 'Nullable (NULL / NOT NULL)' },
  { key: 'defaultValue', label: 'Default (ค่าเริ่มต้น)' },
  { key: 'description', label: 'Description (คำอธิบาย)' },
]

// ชื่อหัวคอลัมน์ที่พบบ่อย ใช้เดาการแมพอัตโนมัติ (เทียบหลังตัดอักขระพิเศษและตัวพิมพ์)
const ALIASES = {
  entity: ['entity', 'table', 'tablename', 'entityname', 'tbl', 'ตาราง', 'ชื่อตาราง', 'เอนทิตี'],
  field: [
    'field', 'fieldname', 'column', 'columnname', 'col', 'colname', 'attribute', 'name',
    'คอลัมน์', 'ฟิลด์', 'ชื่อฟิลด์', 'ชื่อคอลัมน์',
  ],
  type: ['type', 'datatype', 'coltype', 'columntype', 'dtype', 'ชนิด', 'ชนิดข้อมูล', 'ประเภท'],
  key: ['key', 'keytype', 'columnkey', 'constraint', 'pk', 'primarykey', 'คีย์'],
  nullable: ['nullable', 'isnullable', 'null', 'allownull', 'notnull', 'required', 'ว่างได้'],
  defaultValue: ['default', 'defaultvalue', 'columndefault', 'defval', 'ค่าเริ่มต้น'],
  description: [
    'description', 'desc', 'comment', 'comments', 'remark', 'remarks', 'note', 'notes',
    'detail', 'details', 'definition', 'meaning', 'คำอธิบาย', 'รายละเอียด', 'หมายเหตุ', 'ความหมาย',
  ],
}

const normHeader = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[\s_\-./()]+/g, '')
    .trim()

// เดาว่าแต่ละฟิลด์ปลายทางควรมาจากคอลัมน์ไหนของไฟล์ → { entity: 0, field: 1, ... } (ค่าเป็น index หรือ -1)
export function guessMapping(headers) {
  const normalized = headers.map(normHeader)
  const used = new Set()
  const mapping = {}

  // รอบแรกเทียบตรงตัว รอบสองเทียบแบบมีคำนั้นอยู่ในหัว (เช่น "column_name_th")
  TARGET_FIELDS.forEach(({ key }) => {
    const idx = normalized.findIndex((h, i) => !used.has(i) && ALIASES[key].includes(h))
    mapping[key] = idx
    if (idx !== -1) used.add(idx)
  })
  TARGET_FIELDS.forEach(({ key }) => {
    if (mapping[key] !== -1) return
    const idx = normalized.findIndex(
      (h, i) => !used.has(i) && h && ALIASES[key].some((a) => a.length >= 4 && h.includes(a)),
    )
    mapping[key] = idx
    if (idx !== -1) used.add(idx)
  })
  return mapping
}

// ===== CSV / TSV parser (รองรับเครื่องหมายคำพูด, ขึ้นบรรทัดใหม่ในช่อง, BOM) =====
export function parseDelimited(rawText) {
  const text = String(rawText ?? '').replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const count = (ch) => (firstLine.match(new RegExp(`\\${ch}`, 'g')) ?? []).length
  const delimiter = [',', ';', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',')

  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell === '') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }

  const clean = rows.filter((r) => r.some((c) => String(c).trim() !== ''))
  if (!clean.length) return { headers: [], rows: [] }

  const headers = clean[0].map((h, i) => String(h).trim() || `คอลัมน์ ${i + 1}`)
  const body = clean.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? '').trim()))
  return { headers, rows: body }
}

// แปลงตารางจาก Excel (array of arrays) ให้อยู่รูปเดียวกับ parseDelimited
export function tableFromMatrix(matrix) {
  const clean = (matrix ?? []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''))
  if (!clean.length) return { headers: [], rows: [] }
  const headers = clean[0].map((h, i) => String(h ?? '').trim() || `คอลัมน์ ${i + 1}`)
  const rows = clean.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? '').trim()))
  return { headers, rows }
}

// ===== ปรับค่าให้เป็นรูปแบบของ Entity Portal =====
export const normalizeKey = (raw) => {
  const v = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (!v) return ''
  if (['PK', 'PRI', 'PRIMARY', 'PRIMARY KEY', 'P'].includes(v)) return 'PK'
  if (['FK', 'MUL', 'FOREIGN', 'FOREIGN KEY', 'F'].includes(v)) return 'FK'
  if (['UK', 'UNI', 'UNIQUE', 'UNIQUE KEY', 'U'].includes(v)) return 'UK'
  if (v.includes('PRIMARY')) return 'PK'
  if (v.includes('FOREIGN')) return 'FK'
  if (v.includes('UNIQUE')) return 'UK'
  return ''
}

// คืน true = ว่างได้ / false = NOT NULL / undefined = ไม่ทราบ
export const normalizeNullable = (raw) => {
  const v = String(raw ?? '').trim().toLowerCase()
  if (!v) return undefined
  if (['not null', 'notnull', 'no', 'n', 'false', '0', 'required', 'ไม่ว่าง', 'ห้ามว่าง'].includes(v)) return false
  if (['null', 'nullable', 'yes', 'y', 'true', '1', 'optional', 'ว่างได้'].includes(v)) return true
  return undefined
}

// ===== แปลงตาราง + การแมพ → รายการแถวพร้อมนำเข้า =====
// mapping: { entity, field, type, key, nullable, defaultValue, description } → index ของคอลัมน์ในไฟล์ (-1 = ไม่นำเข้า)
export function buildMappedRows(table, mapping, { defaultEntity = '', nullableInverted = false } = {}) {
  const warnings = []
  const out = []
  const pick = (row, key) => (mapping[key] >= 0 ? String(row[mapping[key]] ?? '').trim() : '')

  table.rows.forEach((row, i) => {
    const line = i + 2
    const entity = (pick(row, 'entity') || defaultEntity).trim()
    const field = pick(row, 'field')

    if (!field) {
      warnings.push(`แถว ${line}: ไม่มีชื่อ Field จึงข้ามไป`)
      return
    }
    if (!entity) {
      warnings.push(`แถว ${line}: ไม่มีชื่อ Entity (${field}) จึงข้ามไป`)
      return
    }

    let nullable = normalizeNullable(pick(row, 'nullable'))
    if (nullable !== undefined && nullableInverted) nullable = !nullable

    out.push({
      entity,
      field,
      type: pick(row, 'type') || 'varchar',
      key: normalizeKey(pick(row, 'key')),
      nullable: nullable ?? true,
      defaultValue: pick(row, 'defaultValue'),
      description: pick(row, 'description'),
    })
  })

  return { rows: out, warnings }
}

// รวมแถวที่แมพแล้วเข้ากับ Entity เดิม
// - ชื่อซ้ำ (ไม่สนตัวพิมพ์) ไม่เขียนทับ แต่ถ้า Column เดิมยังไม่มีคำอธิบาย/Type และเลือก fillEmpty จะเติมให้
export function mergeMappedRows(entities, rows, makeEntity, { fillEmpty = true } = {}) {
  const next = entities.map((e) => ({ ...e, fields: [...e.fields] }))
  let addedEntities = 0
  let addedFields = 0
  let skippedFields = 0
  let filledFields = 0

  rows.forEach((r) => {
    let entity = next.find((e) => e.name.toLowerCase() === r.entity.toLowerCase())
    if (!entity) {
      entity = makeEntity(r.entity, next.length)
      entity = { ...entity, fields: [...entity.fields] }
      next.push(entity)
      addedEntities++
    }

    const idx = entity.fields.findIndex((f) => f.name.toLowerCase() === r.field.toLowerCase())
    if (idx === -1) {
      entity.fields.push({
        name: r.field,
        type: r.type,
        key: r.key,
        nullable: r.nullable,
        defaultValue: r.defaultValue,
        description: r.description,
      })
      addedFields++
      return
    }

    skippedFields++
    if (!fillEmpty) return
    const old = entity.fields[idx]
    const patch = {}
    if (!(old.description ?? '').trim() && r.description) patch.description = r.description
    if (!(old.defaultValue ?? '').trim() && r.defaultValue) patch.defaultValue = r.defaultValue
    if (Object.keys(patch).length) {
      entity.fields[idx] = { ...old, ...patch }
      filledFields++
    }
  })

  return { entities: next, addedEntities, addedFields, skippedFields, filledFields }
}

// ===== Export: CSV ที่ตั้งหัวคอลัมน์เองได้ =====
export const CSV_COLUMNS = [
  { key: 'entity', label: 'Entity' },
  { key: 'field', label: 'Field' },
  { key: 'type', label: 'Type' },
  { key: 'key', label: 'Key' },
  { key: 'nullable', label: 'Nullable' },
  { key: 'defaultValue', label: 'Default' },
  { key: 'description', label: 'Description' },
  { key: 'references', label: 'References' },
]

export const NULLABLE_STYLES = {
  nullNotNull: { label: 'NULL / NOT NULL', yes: 'NULL', no: 'NOT NULL' },
  yesNo: { label: 'YES / NO', yes: 'YES', no: 'NO' },
  boolean: { label: 'true / false', yes: 'true', no: 'false' },
}

const csvCell = (value) => {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// columns: [{ key, label, include }] ลำดับตามที่ผู้ใช้จัด
export function buildCustomCsv(entities, relationships, columns, nullableStyle = 'nullNotNull') {
  const active = columns.filter((c) => c.include)
  const style = NULLABLE_STYLES[nullableStyle] ?? NULLABLE_STYLES.nullNotNull

  const refOf = (entity, field) => {
    const links = relationships.filter(
      (r) =>
        (r.toEntity === entity && r.toField === field) || (r.fromEntity === entity && r.fromField === field),
    )
    return links
      .map((r) =>
        r.toEntity === entity && r.toField === field
          ? `${r.fromEntity}.${r.fromField}`
          : `${r.toEntity}.${r.toField}`,
      )
      .join('; ')
  }

  const lines = [active.map((c) => csvCell(c.label.trim() || c.key)).join(',')]
  entities.forEach((entity) => {
    entity.fields.forEach((f) => {
      const values = {
        entity: entity.name,
        field: f.name,
        type: f.type ?? '',
        key: f.key ?? '',
        nullable: f.nullable === false ? style.no : style.yes,
        defaultValue: f.defaultValue ?? '',
        description: f.description ?? '',
        references: refOf(entity.name, f.name),
      }
      lines.push(active.map((c) => csvCell(values[c.key])).join(','))
    })
  })

  return '﻿' + lines.join('\r\n')
}

// ===== Export: SQL ที่เปลี่ยนชื่อตาราง/คอลัมน์ และเลือกตารางได้ =====
// tableNames: { [entity]: newName }, columnNames: { 'ENTITY.field': newName }, included: Set ของชื่อ entity เดิม
export function applyExportRenames(entities, relationships, { tableNames, columnNames, included }) {
  const tName = (name) => (tableNames[name] ?? '').trim() || name
  const cName = (entity, field) => (columnNames[`${entity}.${field}`] ?? '').trim() || field

  const outEntities = entities
    .filter((e) => included.has(e.name))
    .map((e) => ({
      ...e,
      name: tName(e.name),
      fields: e.fields.map((f) => ({ ...f, name: cName(e.name, f.name) })),
    }))

  // ตัด Relationship ที่ปลายข้างใดข้างหนึ่งไม่ได้ถูกเลือกส่งออก (กัน FOREIGN KEY ชี้ไปตารางที่ไม่มี)
  const outRelationships = relationships
    .filter((r) => included.has(r.fromEntity) && included.has(r.toEntity))
    .map((r) => ({
      ...r,
      fromField: cName(r.fromEntity, r.fromField),
      toField: cName(r.toEntity, r.toField),
      fromEntity: tName(r.fromEntity),
      toEntity: tName(r.toEntity),
    }))

  return { entities: outEntities, relationships: outRelationships }
}

// ปรับรูปแบบชื่ออัตโนมัติ (ใช้กับปุ่มลัดในหน้า Export)
export const NAME_CASES = {
  keep: { label: 'ตามเดิม', fn: (s) => s },
  lower: { label: 'ตัวพิมพ์เล็ก_snake_case', fn: (s) => toSnake(s).toLowerCase() },
  upper: { label: 'ตัวพิมพ์ใหญ่_SNAKE_CASE', fn: (s) => toSnake(s).toUpperCase() },
}

function toSnake(s) {
  return String(s)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s\-.]+/g, '_')
}