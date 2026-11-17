// นำเข้าไฟล์ .sql (เฉพาะโครงสร้าง) → Entity / Field / Relationship
// อ่านคำสั่ง CREATE TABLE, ALTER TABLE ... ADD (PK / UNIQUE / FK) และ COMMENT ON
// ไม่รันคำสั่งกับฐานข้อมูลใดๆ และข้าม INSERT / COPY / INDEX / VIEW / FUNCTION ฯลฯ
// รองรับรูปแบบ PostgreSQL, MySQL / MariaDB (รวม dump จาก pg_dump / mysqldump / phpMyAdmin)

// ===== low-level scanning =====
function skipQuoted(s, i, bs) {
  const q = s[i]
  let j = i + 1
  while (j < s.length) {
    const c = s[j]
    if (bs && q === "'" && c === '\\') {
      j += 2
      continue
    }
    if (c === q) {
      if (s[j + 1] === q) {
        j += 2
        continue
      }
      return j + 1
    }
    j++
  }
  return s.length
}

const DOLLAR = /^\$([A-Za-z_]\w*)?\$/

function stripComments(s, bs) {
  const parts = []
  let last = 0
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(s, i, bs)
      continue
    }
    if (c === '$') {
      const m = DOLLAR.exec(s.slice(i, i + 40))
      if (m) {
        const end = s.indexOf(m[0], i + m[0].length)
        i = end < 0 ? s.length : end + m[0].length
        continue
      }
    }
    if (c === '-' && s[i + 1] === '-') {
      parts.push(s.slice(last, i))
      while (i < s.length && s[i] !== '\n') i++
      last = i
      continue
    }
    if (c === '/' && s[i + 1] === '*') {
      parts.push(s.slice(last, i), ' ')
      const e = s.indexOf('*/', i + 2)
      i = e < 0 ? s.length : e + 2
      last = i
      continue
    }
    i++
  }
  parts.push(s.slice(last))
  return parts.join('')
}

function splitStatements(s, bs) {
  const out = []
  let last = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(s, i, bs) - 1
      continue
    }
    if (c === '$') {
      const m = DOLLAR.exec(s.slice(i, i + 40))
      if (m) {
        const end = s.indexOf(m[0], i + m[0].length)
        i = end < 0 ? s.length : end + m[0].length - 1
        continue
      }
    }
    if (c === ';') {
      out.push(s.slice(last, i))
      last = i + 1
    }
  }
  out.push(s.slice(last))
  return out.map((x) => x.trim()).filter(Boolean)
}

function readParens(s, open, bs) {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(s, i, bs) - 1
      continue
    }
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return { inner: s.slice(open + 1, i), end: i + 1 }
    }
  }
  return null
}

function splitTop(s, bs) {
  const out = []
  let depth = 0
  let last = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(s, i, bs) - 1
      continue
    }
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      out.push(s.slice(last, i))
      last = i + 1
    }
  }
  out.push(s.slice(last))
  return out.map((x) => x.trim()).filter(Boolean)
}

function readIdent(s, pos = 0) {
  let i = pos
  while (i < s.length && /\s/.test(s[i])) i++
  const c = s[i]
  if (c === '"' || c === '`') {
    const e = skipQuoted(s, i, false)
    return { name: s.slice(i + 1, e - 1).split(c + c).join(c), end: e }
  }
  if (c === '[') {
    const e = s.indexOf(']', i)
    if (e < 0) return null
    return { name: s.slice(i + 1, e), end: e + 1 }
  }
  const m = /^[\w$\u0080-\uFFFF]+/.exec(s.slice(i, i + 200))
  if (!m) return null
  return { name: m[0], end: i + m[0].length }
}

// schema.table.column → { parts, name(ส่วนสุดท้าย), end }
function readQName(s, pos = 0) {
  const parts = []
  let i = pos
  for (;;) {
    const id = readIdent(s, i)
    if (!id) break
    parts.push(id.name)
    i = id.end
    let j = i
    while (j < s.length && /\s/.test(s[j])) j++
    if (s[j] === '.') i = j + 1
    else break
  }
  if (!parts.length) return null
  return { parts, name: parts[parts.length - 1], end: i }
}

const identList = (inner, bs) =>
  splitTop(inner, bs)
    .map((p) => readIdent(p, 0)?.name)
    .filter(Boolean)

const unquoteSql = (str, bs) => {
  let v = str.replace(/''/g, "'")
  if (bs) v = v.replace(/\\(['"\\])/g, '$1')
  return v
}

// แทนที่เนื้อหาในเครื่องหมาย ' ด้วยช่องว่าง (ความยาวเท่าเดิม) เพื่อค้นหาคำสำคัญโดยไม่หลงเข้าไปในข้อความ
function maskStrings(s, bs) {
  let out = ''
  let last = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "'") {
      const e = skipQuoted(s, i, bs)
      out += s.slice(last, i + 1) + ' '.repeat(Math.max(e - i - 2, 0)) + (e - i >= 2 ? "'" : '')
      last = e
      i = e - 1
    }
  }
  return out + s.slice(last)
}

// อ่านข้อความหลังคำว่า COMMENT '...' (หาตำแหน่งจากสตริงที่ mask แล้ว แต่อ่านค่าจากต้นฉบับ)
function readComment(original, masked, bs) {
  const m = /\bCOMMENT\s*=?\s*(?=')/i.exec(masked)
  if (!m) return ''
  const i = m.index + m[0].length
  const e = skipQuoted(original, i, bs)
  return unquoteSql(original.slice(i + 1, e - 1), bs)
}

// ===== type mapping =====
const TYPE_RULES = [
  [/^(bigint|bigserial|int8|serial8)$/, 'bigint'],
  [/^(int|integer|int4|int2|smallint|mediumint|tinyint|serial|serial4|smallserial|year)$/, 'int'],
  [/^(bool|boolean|bit)$/, 'boolean'],
  [/^(varchar|nvarchar|char|nchar|character|character varying|varchar2|nvarchar2|string|citext|name|bpchar)$/, 'varchar'],
  [/^(text|tinytext|mediumtext|longtext|ntext|clob)$/, 'text'],
  [/^date$/, 'date'],
  [/^(datetime|datetime2|smalldatetime|timestamp|timestamptz|timestamp with time zone|timestamp without time zone)$/, 'datetime'],
  [/^(decimal|dec|numeric|number|float|float4|float8|double|double precision|real|money)$/, 'decimal'],
  [/^(uuid|uniqueidentifier)$/, 'uuid'],
]

const LOSSY_TO_TEXT = /^(json|jsonb|xml|enum|set|blob|tinyblob|mediumblob|longblob|bytea|binary|varbinary|image)$/
const LOSSY_TO_VARCHAR = /^(time|timetz|time with time zone|time without time zone|interval|inet|cidr|macaddr)$/

function mapType(typeText) {
  const raw = typeText.trim()
  // SQL Server เขียนชนิดข้อมูลในวงเล็บเหลี่ยม เช่น [nvarchar](100)
  const lower = raw.toLowerCase().replace(/\[([a-z_ ]+)\]/g, '$1').replace(/\s+/g, ' ')
  const isArray = /\[\s*\d*\s*\]\s*$/.test(lower) || /^array\b/.test(lower)
  const tinyBool = /^tinyint\s*\(\s*1\s*\)/.test(lower)

  const base = lower
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\b(unsigned|signed|zerofill)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!base) return { type: 'varchar', note: 'ไม่พบชนิดข้อมูล ใช้ varchar แทน' }
  if (isArray) return { type: 'text', note: `type "${raw}" (array) แปลงเป็น text` }
  if (tinyBool) return { type: 'boolean' }

  for (const [re, type] of TYPE_RULES) if (re.test(base)) return { type }
  if (LOSSY_TO_TEXT.test(base)) return { type: 'text', note: `type "${raw}" แปลงเป็น text` }
  if (LOSSY_TO_VARCHAR.test(base)) return { type: 'varchar', note: `type "${raw}" แปลงเป็น varchar` }
  return { type: 'varchar', note: `ไม่รู้จัก type "${raw}" ใช้ varchar แทน` }
}

// ===== column parsing =====
const MOD_START =
  /(?:NOT|NULL|DEFAULT|PRIMARY|UNIQUE|REFERENCES|CHECK|COMMENT|AUTO_INCREMENT|AUTOINCREMENT|GENERATED|COLLATE|CHARACTER\s+SET|CHARSET|ON|CONSTRAINT|IDENTITY|VISIBLE|INVISIBLE|AS)\b/iy

function splitTypeMods(rest, bs) {
  let depth = 0
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i]
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(rest, i, bs) - 1
      continue
    }
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && (i === 0 || /[\s)]/.test(rest[i - 1]))) {
      MOD_START.lastIndex = i
      if (MOD_START.test(rest)) return { typeText: rest.slice(0, i).trim(), mods: rest.slice(i) }
    }
  }
  return { typeText: rest.trim(), mods: '' }
}

function readDefault(mods, bs) {
  const m = /\bDEFAULT\s+/i.exec(mods)
  if (!m) return ''
  let i = m.index + m[0].length
  let value = ''

  if (mods[i] === "'") {
    const e = skipQuoted(mods, i, bs)
    return unquoteSql(mods.slice(i + 1, e - 1), bs)
  }
  if (mods[i] === '(') {
    const p = readParens(mods, i, bs)
    value = p ? p.inner.trim() : ''
  } else {
    const w = /^[\w.+-]+/.exec(mods.slice(i))
    value = w ? w[0] : ''
    i += value.length
    if (mods[i] === '(') {
      const p = readParens(mods, i, bs)
      if (p) value += mods.slice(i, p.end)
    }
  }

  value = value.replace(/::[\s\S]*$/, '').trim()
  const q = /^'([\s\S]*)'$/.exec(value)
  if (q) value = unquoteSql(q[1], bs)
  if (/^null$/i.test(value) || /^nextval\(/i.test(value)) return ''
  return value
}

const KEY_RANK = { '': 0, UK: 1, FK: 2, PK: 3 }
const setKey = (field, key) => {
  if (KEY_RANK[key] > KEY_RANK[field.key]) field.key = key
}

const findTable = (tables, name) => tables.find((t) => t.name.toLowerCase() === String(name).toLowerCase())
const findField = (table, name) => table?.fields.find((f) => f.name.toLowerCase() === String(name).toLowerCase())

// ===== constraints (ใช้ทั้งใน CREATE TABLE และ ALTER TABLE) =====
const CONSTRAINT_RE =
  /^(?:CONSTRAINT\s+(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w$]+)\s+)?(PRIMARY\s+KEY|UNIQUE(?:\s+(?:KEY|INDEX))?|FOREIGN\s+KEY)\b/i

function applyConstraint(table, match, def, ctx) {
  const kind = match[1].toUpperCase().replace(/\s+/g, ' ')
  const rest = def.slice(match[0].length)
  const open = rest.indexOf('(')
  if (open < 0) return
  const cols = readParens(rest, open, ctx.bs)
  if (!cols) return
  const names = identList(cols.inner, ctx.bs)
  const label = `${table.name}`

  const resolve = () =>
    names.map((n) => {
      const f = findField(table, n)
      if (!f) ctx.warnings.push(`${label}: ไม่พบ Column "${n}" ที่ใช้ใน constraint จึงข้าม`)
      return f
    })

  if (kind === 'PRIMARY KEY') {
    resolve().forEach((f) => {
      if (!f) return
      setKey(f, 'PK')
      f.nullable = false
    })
    table.pk = names
  } else if (kind.startsWith('UNIQUE')) {
    if (names.length === 1) {
      const f = findField(table, names[0])
      if (f) {
        f._unique = true
        setKey(f, 'UK')
      }
    } else {
      ctx.warnings.push(`${label}: UNIQUE หลายคอลัมน์ (${names.join(', ')}) ระบบรองรับเฉพาะ UK คอลัมน์เดียว จึงข้าม`)
    }
  } else {
    const after = rest.slice(cols.end)
    const ref = /^\s*REFERENCES\s+/i.exec(after)
    if (!ref) return
    const parent = readQName(after, ref[0].length)
    if (!parent) return
    let parentCols = null
    const tail = after.slice(parent.end)
    const po = tail.indexOf('(')
    if (po >= 0 && /^\s*\(/.test(tail)) {
      const p = readParens(tail, po, ctx.bs)
      if (p) parentCols = identList(p.inner, ctx.bs)
    }
    resolve().forEach((f) => f && setKey(f, 'FK'))
    ctx.fks.push({ child: table.name, childCols: names, parent: parent.name, parentCols })
  }
}

// ===== CREATE TABLE =====
const CREATE_TABLE_RE =
  /^CREATE\s+(?:(?:GLOBAL\s+|LOCAL\s+)?(?:TEMPORARY|TEMP)\s+|UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i

function parseCreateTable(stmt, ctx) {
  const head = CREATE_TABLE_RE.exec(stmt)
  if (!head) return false
  const qn = readQName(stmt, head[0].length)
  if (!qn) return false

  let i = qn.end
  while (i < stmt.length && /\s/.test(stmt[i])) i++
  if (stmt[i] !== '(') return false

  const body = readParens(stmt, i, ctx.bs)
  if (!body) return false

  const table = { name: qn.name, description: '', fields: [], pk: [] }
  const tail = stmt.slice(body.end)
  table.description = readComment(tail, maskStrings(tail, ctx.bs), ctx.bs)

  const constraints = []

  splitTop(body.inner, ctx.bs).forEach((def) => {
    const cm = CONSTRAINT_RE.exec(def)
    if (cm) {
      constraints.push([cm, def])
      return
    }
    if (/^(?:CONSTRAINT\b|KEY\b|INDEX\b|FULLTEXT\b|SPATIAL\b|CHECK\b|EXCLUDE\b|LIKE\b|PERIOD\b)/i.test(def)) return

    const id = readIdent(def, 0)
    if (!id) return
    const { typeText, mods } = splitTypeMods(def.slice(id.end).trim(), ctx.bs)
    const mapped = mapType(typeText)
    if (mapped.note) ctx.warnings.push(`${qn.name}.${id.name}: ${mapped.note}`)

    const clean = maskStrings(mods, ctx.bs)
    const field = {
      name: id.name,
      type: mapped.type,
      key: '',
      nullable: !/\bNOT\s+NULL\b/i.test(clean),
      defaultValue: readDefault(mods, ctx.bs),
      description: '',
      _unique: false,
    }

    field.description = readComment(mods, clean, ctx.bs)

    if (/\bPRIMARY\s+KEY\b/i.test(clean)) {
      field.key = 'PK'
      field.nullable = false
      table.pk.push(field.name)
    } else if (/\bUNIQUE\b/i.test(clean)) {
      field._unique = true
      field.key = 'UK'
    }

    const refAt = clean.search(/\bREFERENCES\s+/i)
    if (refAt >= 0) {
      const after = mods.slice(refAt).replace(/^REFERENCES\s+/i, '')
      const parent = readQName(after, 0)
      if (parent) {
        let parentCols = null
        const tail2 = after.slice(parent.end)
        if (/^\s*\(/.test(tail2)) {
          const p = readParens(tail2, tail2.indexOf('('), ctx.bs)
          if (p) parentCols = identList(p.inner, ctx.bs)
        }
        setKey(field, 'FK')
        ctx.fks.push({ child: qn.name, childCols: [field.name], parent: parent.name, parentCols })
      }
    }

    table.fields.push(field)
  })

  constraints.forEach(([cm, def]) => applyConstraint(table, cm, def, ctx))
  ctx.tables.push(table)
  return true
}

// ===== ALTER TABLE / COMMENT ON =====
function parseAlterTable(stmt, ctx) {
  const head = /^ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?/i.exec(stmt)
  if (!head) return false
  const qn = readQName(stmt, head[0].length)
  if (!qn) return false
  const table = findTable(ctx.tables, qn.name)

  splitTop(stmt.slice(qn.end), ctx.bs).forEach((clause) => {
    const def = clause.replace(/^(?:WITH\s+(?:NO)?CHECK\s+)?ADD\s+/i, '')
    const cm = CONSTRAINT_RE.exec(def)
    if (!cm) return
    if (!table) {
      ctx.warnings.push(`ALTER TABLE ${qn.name}: ไม่พบตารางนี้ในไฟล์ จึงข้าม`)
      return
    }
    applyConstraint(table, cm, def, ctx)
  })
  return true
}

function parseCommentOn(stmt, ctx) {
  const head = /^COMMENT\s+ON\s+(TABLE|COLUMN)\s+/i.exec(stmt)
  if (!head) return false
  const qn = readQName(stmt, head[0].length)
  if (!qn) return true
  const is = /^\s+IS\s+('(?:[^']|'')*'|NULL)/i.exec(stmt.slice(qn.end))
  if (!is) return true
  const text = /^null$/i.test(is[1]) ? '' : unquoteSql(is[1].slice(1, -1), ctx.bs)

  if (head[1].toUpperCase() === 'TABLE') {
    const t = findTable(ctx.tables, qn.name)
    if (t) t.description = text
  } else if (qn.parts.length >= 2) {
    const t = findTable(ctx.tables, qn.parts[qn.parts.length - 2])
    const f = findField(t, qn.name)
    if (f) f.description = text
  }
  return true
}

// ===== public: parse =====
export function parseSqlSchema(text) {
  const warnings = []
  let src = String(text ?? '').replace(/^\uFEFF/, '')

  const bs = /ENGINE\s*=|\/\*!\d{5}|AUTO_INCREMENT|`[A-Za-z_]\w*`/i.test(src)

  // ข้อมูลที่ pg_dump ใส่ไว้หลัง COPY ... FROM stdin (ตัดทิ้งก่อน เพราะอาจมีเครื่องหมายคำพูด/semicolon)
  let copyBlocks = 0
  src = src.replace(/^COPY\s+[^\n]*?\bFROM\s+stdin\b[^\n]*\n[\s\S]*?^\\\.[ \t]*$/gim, () => {
    copyBlocks++
    return ''
  })

  const statements = splitStatements(stripComments(src, bs), bs)
  const ctx = { tables: [], fks: [], warnings, bs }

  const later = []
  let inserts = copyBlocks
  let others = 0

  statements.forEach((stmt) => {
    if (parseCreateTable(stmt, ctx)) return
    if (/^(?:ALTER\s+TABLE|COMMENT\s+ON)\b/i.test(stmt)) {
      later.push(stmt)
      return
    }
    if (/^INSERT\b/i.test(stmt)) inserts++
    else others++
  })

  later.forEach((stmt) => {
    if (!parseAlterTable(stmt, ctx)) parseCommentOn(stmt, ctx)
  })

  if (!ctx.tables.length) {
    return {
      rows: [],
      tables: [],
      relationships: [],
      warnings,
      error: 'ไม่พบคำสั่ง CREATE TABLE ในไฟล์ (ระบบนำเข้าเฉพาะโครงสร้างตาราง ไม่นำเข้าข้อมูล)',
    }
  }

  // สร้าง Relationship จาก FOREIGN KEY: ตารางแม่ (ถูกอ้างถึง) → ตารางลูก (ถือ FK) ชนิด 1:N
  const relationships = []
  const seen = new Set()
  ctx.fks.forEach((fk) => {
    const child = findTable(ctx.tables, fk.child)
    const parent = findTable(ctx.tables, fk.parent)
    if (!parent) {
      warnings.push(`FK ${fk.child}(${fk.childCols.join(', ')}): ไม่พบตารางที่อ้างถึง "${fk.parent}" ในไฟล์ จึงไม่สร้าง Relationship`)
      return
    }
    const parentCols = fk.parentCols?.length ? fk.parentCols : parent.pk
    if (!parentCols?.length || parentCols.length !== fk.childCols.length) {
      warnings.push(`FK ${fk.child}(${fk.childCols.join(', ')}) → ${parent.name}: จับคู่ Column ปลายทางไม่ได้ จึงไม่สร้าง Relationship`)
      return
    }

    fk.childCols.forEach((cc, i) => {
      const childField = findField(child, cc)
      const parentField = findField(parent, parentCols[i])
      if (!childField || !parentField) {
        warnings.push(`FK ${fk.child}.${cc} → ${parent.name}.${parentCols[i]}: ไม่พบ Column จึงไม่สร้าง Relationship`)
        return
      }
      const id = `${parent.name}.${parentField.name}>${child.name}.${childField.name}`.toLowerCase()
      if (seen.has(id)) return
      seen.add(id)

      const oneToOne =
        fk.childCols.length === 1 && (childField._unique || (child.pk.length === 1 && child.pk[0].toLowerCase() === childField.name.toLowerCase()))

      relationships.push({
        fromEntity: parent.name,
        fromField: parentField.name,
        toEntity: child.name,
        toField: childField.name,
        type: oneToOne ? '1:1' : '1:N',
        label: '',
        detail: '',
      })
    })
  })

  if (inserts) warnings.push(`ข้ามข้อมูล (INSERT/COPY) ${inserts} รายการ — ระบบนำเข้าเฉพาะโครงสร้างตาราง`)
  if (others) warnings.push(`ข้ามคำสั่งอื่นที่ไม่ใช่โครงสร้างตาราง ${others} คำสั่ง (เช่น INDEX, VIEW, FUNCTION, SET)`)

  const tables = ctx.tables.map((t) => ({
    name: t.name,
    description: t.description,
    fields: t.fields.map(({ _unique, ...f }) => f),
  }))

  const rows = tables.flatMap((t) => t.fields.map((f) => ({ entity: t.name, field: f.name, ...omitName(f) })))

  return { rows, tables, relationships, warnings, error: null }
}

function omitName(f) {
  const { name, ...rest } = f
  return rest
}

// ===== public: merge เข้ากับของเดิม (ไม่เขียนทับ — ชื่อซ้ำจะข้าม) =====
export function applySqlImport(currentEntities, currentRelationships, parsed, makeEntity) {
  const entities = currentEntities.map((e) => ({ ...e, fields: [...e.fields] }))
  let addedEntities = 0
  let addedFields = 0
  let skippedFields = 0

  parsed.tables.forEach((t) => {
    let entity = entities.find((e) => e.name.toLowerCase() === t.name.toLowerCase())
    if (!entity) {
      entity = makeEntity(t.name, entities.length)
      entity.fields = []
      if (t.description) entity.description = t.description
      entities.push(entity)
      addedEntities++
    }
    t.fields.forEach((f) => {
      if (entity.fields.some((x) => x.name.toLowerCase() === f.name.toLowerCase())) {
        skippedFields++
        return
      }
      entity.fields.push({
        name: f.name,
        type: f.type,
        key: f.key,
        nullable: f.nullable,
        defaultValue: f.defaultValue,
        description: f.description,
      })
      addedFields++
    })
  })

  const relationships = [...currentRelationships]
  let addedRelationships = 0
  let skippedRelationships = 0
  const stamp = Date.now()

  const actual = (entityName, fieldName) => {
    const e = entities.find((x) => x.name.toLowerCase() === entityName.toLowerCase())
    const f = e?.fields.find((x) => x.name.toLowerCase() === fieldName.toLowerCase())
    return e && f ? { entity: e.name, field: f.name } : null
  }

  parsed.relationships.forEach((r) => {
    const from = actual(r.fromEntity, r.fromField)
    const to = actual(r.toEntity, r.toField)
    if (!from || !to) {
      skippedRelationships++
      return
    }
    const dup = relationships.some(
      (x) =>
        x.fromEntity === from.entity &&
        x.fromField === from.field &&
        x.toEntity === to.entity &&
        x.toField === to.field,
    )
    if (dup) {
      skippedRelationships++
      return
    }
    relationships.push({
      id: stamp + addedRelationships,
      fromEntity: from.entity,
      fromField: from.field,
      toEntity: to.entity,
      toField: to.field,
      type: r.type,
      label: r.label,
      detail: r.detail,
    })
    addedRelationships++
  })

  return {
    entities,
    relationships,
    addedEntities,
    addedFields,
    skippedFields,
    addedRelationships,
    skippedRelationships,
  }
}