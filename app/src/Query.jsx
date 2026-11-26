import { useMemo, useState } from 'react'
import { Copy, Check, Plus, X, ArrowRight, Terminal } from 'lucide-react'

/* ======================================================================
   SQL Builder — อ่านอย่างเดียว ไม่แตะระบบ autosave/sync
   สร้าง SELECT ... JOIN ... WHERE จาก Relationships ที่บันทึกไว้
   ====================================================================== */
const NUMERIC_TYPES = ['int', 'bigint', 'decimal', 'float', 'double', 'numeric', 'smallint']

const OPS = [
  { value: '=', label: '=' },
  { value: '<>', label: '≠' },
  { value: '>', label: '>' },
  { value: '>=', label: '≥' },
  { value: '<', label: '<' },
  { value: '<=', label: '≤' },
  { value: 'LIKE', label: 'LIKE' },
  { value: 'IN', label: 'IN' },
  { value: 'IS NULL', label: 'IS NULL' },
  { value: 'IS NOT NULL', label: 'IS NOT NULL' },
]



/* ---------- helpers ---------- */

const quoteIdent = (name, dialect) => {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name
  return dialect === 'mysql' ? `\`${name.replace(/`/g, '``')}\`` : `"${name.replace(/"/g, '""')}"`
}

const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`

const formatValue = (raw, type) => {
  const v = String(raw).trim()
  const numeric = NUMERIC_TYPES.includes(String(type ?? '').toLowerCase())
  if (numeric && v !== '' && !Number.isNaN(Number(v))) return v
  return sqlString(v)
}

// สร้าง "node" (ตารางที่อยู่ใน FROM/JOIN) จากรายการ relationship id ที่เลือก
// ตัด join ที่ไม่มีตารางต้นทางเชื่อมถึง (เช่น หลังยกเลิก join ก่อนหน้า) ออกให้อัตโนมัติ
function resolveJoins(baseName, relationships, ids) {
  const nodes = [{ key: 'base', entity: baseName, alias: '' }]
  const joins = []
  const used = []
  let pending = ids.filter((id) => relationships.some((r) => r.id === id))
  let progressed = true

  while (pending.length && progressed) {
    progressed = false
    for (const id of [...pending]) {
      const rel = relationships.find((r) => r.id === id)
      const fromNode = nodes.find((n) => n.entity === rel.fromEntity)
      const toNode = nodes.find((n) => n.entity === rel.toEntity)
      if (!fromNode && !toNode) continue

      // ถ้ามีฝั่ง from อยู่แล้ว → เพิ่มฝั่ง to เป็นตารางใหม่ (ไม่งั้นกลับกัน)
      const anchorIsFrom = Boolean(fromNode)
      const anchor = anchorIsFrom ? fromNode : toNode
      const newEntity = anchorIsFrom ? rel.toEntity : rel.fromEntity
      const node = { key: `r${rel.id}`, entity: newEntity, alias: '' }
      nodes.push(node)
      joins.push({
        key: node.key,
        rel,
        node,
        anchor,
        anchorField: anchorIsFrom ? rel.fromField : rel.toField,
        newField: anchorIsFrom ? rel.toField : rel.fromField,
      })
      used.push(id)
      pending = pending.filter((p) => p !== id)
      progressed = true
    }
  }

  // ตั้ง alias (ซ้ำ → ต่อท้าย _2, _3 ...)
  const seen = {}
  nodes.forEach((n) => {
    const base = n.entity.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 't'
    seen[base] = (seen[base] ?? 0) + 1
    n.alias = seen[base] === 1 ? base : `${base}_${seen[base]}`
  })

  return { nodes, joins, ids: used }
}

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  return new Promise((resolve, reject) => {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
      resolve()
    } catch (error) {
      reject(error)
    }
  })
}

/* ======================================================================
   Main
   ====================================================================== */

export default function Query({ entities, relationships }) {
  return (
    <section className="panel qx-panel">
      <div className="panel-heading">
        <div>
          <h2><Terminal size={19} /> SQL Builder</h2>
          <p>สร้างคำสั่ง SELECT / JOIN จาก Relationship ที่บันทึกไว้ แล้วคัดลอกไปรันกับฐานข้อมูลจริงของคุณ (ที่นี่ไม่ได้รันคำสั่ง)</p>
        </div>
      </div>
      {entities.length === 0 ? (
        <div className="empty-state big">
          <Terminal size={30} />
          <p>ยังไม่มี Entity</p>
          <span>สร้าง Entity และ Column ก่อน แล้วกลับมาที่หน้านี้</span>
        </div>
      ) : (
        <SqlBuilder entities={entities} relationships={relationships} />
      )}
    </section>
  )
}

/* ======================================================================
   Tab 2 — SQL Builder
   ====================================================================== */

function SqlBuilder({ entities, relationships }) {
  const [baseName, setBaseName] = useState('')
  const [joinIds, setJoinIds] = useState([])
  const [joinType, setJoinType] = useState('INNER')
  const [dialect, setDialect] = useState('postgres')
  const [columns, setColumns] = useState({}) // { [nodeKey]: string[] }
  const [conditions, setConditions] = useState([])
  const [logic, setLogic] = useState('AND')
  const [limit, setLimit] = useState('100')
  const [copied, setCopied] = useState(false)

  const base = entities.find((e) => e.name === baseName) ?? entities[0]
  const entityOf = (name) => entities.find((e) => e.name === name)

  const { nodes, joins, ids } = useMemo(
    () => resolveJoins(base.name, relationships, joinIds),
    [base.name, relationships, joinIds],
  )

  // relationship ที่เพิ่มเป็น JOIN ได้ตอนนี้ (มีตารางด้านใดด้านหนึ่งอยู่ใน query แล้ว) + ที่เลือกอยู่
  const joinOptions = useMemo(() => {
    const inQuery = new Set(nodes.map((n) => n.entity))
    return relationships.filter(
      (r) => ids.includes(r.id) || inQuery.has(r.fromEntity) || inQuery.has(r.toEntity),
    )
  }, [nodes, ids, relationships])

  const nodeLabel = (n) => (n.alias === n.entity.toLowerCase() ? n.entity : `${n.entity} (${n.alias})`)

  const changeBase = (name) => {
    setBaseName(name)
    setJoinIds([])
    setColumns({})
    setConditions([])
  }

  const toggleJoin = (id) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    const resolved = resolveJoins(base.name, relationships, next)
    setJoinIds(resolved.ids)
    // ล้าง column / เงื่อนไขของ node ที่หายไป
    const keep = new Set(resolved.nodes.map((n) => n.key))
    setColumns((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => keep.has(k))))
    setConditions((cur) => cur.filter((c) => keep.has(c.nodeKey)))
  }

  const toggleColumn = (nodeKey, field) =>
    setColumns((cur) => {
      const list = cur[nodeKey] ?? []
      return { ...cur, [nodeKey]: list.includes(field) ? list.filter((f) => f !== field) : [...list, field] }
    })

  const toggleAllColumns = (node) => {
    const all = entityOf(node.entity)?.fields.map((f) => f.name) ?? []
    setColumns((cur) => ({ ...cur, [node.key]: (cur[node.key] ?? []).length === all.length ? [] : all }))
  }

  const addCondition = () => {
    const first = nodes[0]
    const field = entityOf(first.entity)?.fields[0]?.name ?? ''
    setConditions((cur) => [
      ...cur,
      { id: crypto.randomUUID(), nodeKey: first.key, field, op: '=', value: '' },
    ])
  }

  const updateCondition = (id, patch) =>
    setConditions((cur) => cur.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  const removeCondition = (id) => setConditions((cur) => cur.filter((c) => c.id !== id))

  /* ---------- สร้าง SQL ---------- */
  const sql = useMemo(() => {
    const q = (name) => quoteIdent(name, dialect)
    const multi = nodes.length > 1

    const selected = nodes.flatMap((n) =>
      (columns[n.key] ?? [])
        .filter((f) => entityOf(n.entity)?.fields.some((x) => x.name === f))
        .map((f) => (multi ? `${q(n.alias)}.${q(f)} AS ${q(`${n.alias}_${f}`)}` : `${q(n.alias)}.${q(f)}`)),
    )

    const lines = [`SELECT ${selected.length ? '\n  ' + selected.join(',\n  ') : '*'}`]
    lines.push(`FROM ${q(base.name)} ${q(nodes[0].alias)}`)

    joins.forEach((j) => {
      lines.push(
        `${joinType} JOIN ${q(j.node.entity)} ${q(j.node.alias)}\n  ON ${q(j.anchor.alias)}.${q(j.anchorField)} = ${q(j.node.alias)}.${q(j.newField)}`,
      )
    })

    const where = conditions
      .map((c) => {
        const node = nodes.find((n) => n.key === c.nodeKey)
        if (!node || !c.field) return null
        const col = `${q(node.alias)}.${q(c.field)}`
        if (c.op === 'IS NULL' || c.op === 'IS NOT NULL') return `${col} ${c.op}`
        const raw = String(c.value).trim()
        if (raw === '') return null
        const type = entityOf(node.entity)?.fields.find((f) => f.name === c.field)?.type
        if (c.op === 'IN') {
          const items = raw.split(',').map((s) => s.trim()).filter(Boolean)
          return items.length ? `${col} IN (${items.map((s) => formatValue(s, type)).join(', ')})` : null
        }
        if (c.op === 'LIKE') return `${col} LIKE ${sqlString(raw)}`
        return `${col} ${c.op} ${formatValue(raw, type)}`
      })
      .filter(Boolean)

    if (where.length) lines.push(`WHERE ${where.join(`\n  ${logic} `)}`)

    const n = parseInt(limit, 10)
    if (Number.isFinite(n) && n > 0) lines.push(`LIMIT ${n}`)

    return lines.join('\n') + ';'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, joins, columns, conditions, logic, limit, joinType, dialect, base, entities])

  const handleCopy = async () => {
    try {
      await copyText(sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      alert('คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกเอง')
    }
  }

  return (
    <div className="qx-builder">
      {/* ---------- ฝั่งตั้งค่า ---------- */}
      <div className="qx-config">
        <div className="qx-block">
          <h3>1. ตารางเริ่มต้น</h3>
          <select className="filter-select qx-wide" value={base.name} onChange={(e) => changeBase(e.target.value)}>
            {entities.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
          </select>
        </div>

        <div className="qx-block">
          <h3>2. JOIN จาก Relationship</h3>
          {joinOptions.length === 0 ? (
            <p className="qx-muted">
              ตาราง {base.name} ยังไม่มี Relationship — เพิ่มได้ที่หน้า Relationships
            </p>
          ) : (
            <>
              <div className="qx-row">
                <label className="qx-inline">
                  ชนิด JOIN
                  <select className="filter-select" value={joinType} onChange={(e) => setJoinType(e.target.value)}>
                    <option value="INNER">INNER JOIN</option>
                    <option value="LEFT">LEFT JOIN</option>
                  </select>
                </label>
              </div>
              <div className="qx-joinlist">
                {joinOptions.map((r) => (
                  <label key={r.id} className={`qx-join ${ids.includes(r.id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={ids.includes(r.id)} onChange={() => toggleJoin(r.id)} />
                    <span>
                      <code>{r.fromEntity}.{r.fromField}</code>
                      <ArrowRight size={12} />
                      <code>{r.toEntity}.{r.toField}</code>
                      <small>{r.type}{r.label ? ` · ${r.label}` : ''}</small>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="qx-block">
          <h3>3. เลือก Column</h3>
          <p className="qx-muted">ไม่เลือกเลย = SELECT *</p>
          {nodes.map((n) => {
            const fields = entityOf(n.entity)?.fields ?? []
            const picked = columns[n.key] ?? []
            return (
              <div key={n.key} className="qx-cols">
                <div className="qx-cols-head">
                  <strong>{nodeLabel(n)}</strong>
                  <button type="button" className="text-button" onClick={() => toggleAllColumns(n)}>
                    {picked.length === fields.length && fields.length > 0 ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                  </button>
                </div>
                <div className="qx-cols-grid">
                  {fields.map((f) => (
                    <label key={f.name} className="qx-check">
                      <input type="checkbox" checked={picked.includes(f.name)} onChange={() => toggleColumn(n.key, f.name)} />
                      <span>{f.name}</span>
                      {f.key && <span className={`key-tag ${f.key.toLowerCase()}`}>{f.key}</span>}
                    </label>
                  ))}
                  {fields.length === 0 && <span className="qx-muted">ยังไม่มี Column</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div className="qx-block">
          <div className="qx-block-head">
            <h3>4. เงื่อนไข WHERE</h3>
            <button type="button" className="secondary-button qx-small" onClick={addCondition}>
              <Plus size={14} /> เพิ่มเงื่อนไข
            </button>
          </div>

          {conditions.length > 1 && (
            <div className="qx-row">
              <label className="qx-inline">
                เชื่อมเงื่อนไขด้วย
                <select className="filter-select" value={logic} onChange={(e) => setLogic(e.target.value)}>
                  <option value="AND">AND (ตรงทุกข้อ)</option>
                  <option value="OR">OR (ตรงข้อใดข้อหนึ่ง)</option>
                </select>
              </label>
            </div>
          )}

          {conditions.map((c) => {
            const node = nodes.find((n) => n.key === c.nodeKey) ?? nodes[0]
            const fields = entityOf(node.entity)?.fields ?? []
            const noValue = c.op === 'IS NULL' || c.op === 'IS NOT NULL'
            return (
              <div key={c.id} className="qx-cond">
                <select
                  className="filter-select"
                  value={c.nodeKey}
                  onChange={(e) => {
                    const target = nodes.find((n) => n.key === e.target.value)
                    updateCondition(c.id, {
                      nodeKey: e.target.value,
                      field: entityOf(target.entity)?.fields[0]?.name ?? '',
                    })
                  }}
                >
                  {nodes.map((n) => <option key={n.key} value={n.key}>{nodeLabel(n)}</option>)}
                </select>
                <select className="filter-select" value={c.field} onChange={(e) => updateCondition(c.id, { field: e.target.value })}>
                  {fields.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                </select>
                <select className="filter-select" value={c.op} onChange={(e) => updateCondition(c.id, { op: e.target.value })}>
                  {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input
                  className="qx-input"
                  disabled={noValue}
                  value={noValue ? '' : c.value}
                  placeholder={c.op === 'IN' ? 'ค่า1, ค่า2, ค่า3' : c.op === 'LIKE' ? '%คำค้น%' : 'ค่า'}
                  onChange={(e) => updateCondition(c.id, { value: e.target.value })}
                />
                <button type="button" className="icon-button" aria-label="ลบเงื่อนไข" onClick={() => removeCondition(c.id)}>
                  <X size={15} />
                </button>
              </div>
            )
          })}
          {conditions.length === 0 && <p className="qx-muted">ยังไม่มีเงื่อนไข — จะดึงทุกแถว</p>}
        </div>

        <div className="qx-block">
          <h3>5. ตั้งค่าเพิ่มเติม</h3>
          <div className="qx-row">
            <label className="qx-inline">
              LIMIT
              <input
                className="qx-input qx-limit"
                type="number"
                min="0"
                value={limit}
                placeholder="ไม่จำกัด"
                onChange={(e) => setLimit(e.target.value)}
              />
            </label>
            <label className="qx-inline">
              Dialect
              <select className="filter-select" value={dialect} onChange={(e) => setDialect(e.target.value)}>
                <option value="postgres">PostgreSQL</option>
                <option value="mysql">MySQL / MariaDB</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* ---------- ฝั่งผลลัพธ์ ---------- */}
      <div className="qx-output">
        <div className="qx-output-head">
          <strong>SQL</strong>
          <button type="button" className="primary-button qx-small" onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'คัดลอกแล้ว' : 'Copy SQL'}
          </button>
        </div>
        <pre className="qx-sql"><code>{sql}</code></pre>
        <p className="qx-muted">
          SQL ถูกสร้างจากโครงสร้างที่บันทึกไว้ในเอกสาร ตรวจสอบชื่อตาราง/Column กับฐานข้อมูลจริงก่อนนำไปรัน
        </p>
      </div>
    </div>
  )
}
