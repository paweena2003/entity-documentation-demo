import { useMemo, useState } from 'react'
import { Search, Copy, Check, Plus, X, ArrowRight, Terminal, ShieldCheck } from 'lucide-react'

/* ======================================================================
   Query page — อ่านอย่างเดียว ไม่แตะระบบ autosave/sync
   แท็บ 1: Explore      → ค้นหา/กรอง Column และตรวจคุณภาพเอกสาร
   แท็บ 2: SQL Builder  → สร้าง SELECT ... JOIN ... WHERE จาก Relationships
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

const PRESETS = [
  { id: 'noPk', label: 'Entity ที่ไม่มี PK', kind: 'entity' },
  { id: 'orphan', label: 'Entity ที่ไม่มี Relationship', kind: 'entity' },
  { id: 'fkNoRel', label: 'FK ที่ยังไม่มี Relationship', kind: 'field' },
  { id: 'noDesc', label: 'Column ที่ไม่มีคำอธิบาย', kind: 'field' },
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

export default function Query({ entities, relationships, onOpenEntity }) {
  const [tab, setTab] = useState('explore')

  return (
    <section className="panel qx-panel">
      <div className="panel-heading">
        <div>
          <h2><Terminal size={19} /> Query</h2>
          <p>ค้นหาโครงสร้างและสร้าง SQL จาก Entity / Relationship ของโปรเจกต์นี้ (อ่านอย่างเดียว ไม่รันกับฐานข้อมูลจริง)</p>
        </div>
      </div>

      <div className="qx-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'explore'}
          className={tab === 'explore' ? 'active' : ''}
          onClick={() => setTab('explore')}
        >
          Explore
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sql'}
          className={tab === 'sql' ? 'active' : ''}
          onClick={() => setTab('sql')}
        >
          SQL Builder
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'console'}
          className={tab === 'console' ? 'active' : ''}
          onClick={() => setTab('console')}
        >
          SQL Console
        </button>
      </div>

      {entities.length === 0 ? (
        <div className="empty-state big">
          <Terminal size={30} />
          <p>ยังไม่มี Entity ให้ Query</p>
          <span>สร้าง Entity และ Column ก่อน แล้วกลับมาที่หน้านี้</span>
        </div>
      ) : tab === 'explore' ? (
        <Explore entities={entities} relationships={relationships} onOpenEntity={onOpenEntity} />
      ) : tab === 'sql' ? (
        <SqlBuilder entities={entities} relationships={relationships} />
      ) : (
        <SqlConsole entities={entities} relationships={relationships} />
      )}
    </section>
  )
}

/* ======================================================================
   Tab 1 — Explore
   ====================================================================== */

function Explore({ entities, relationships, onOpenEntity }) {
  const [text, setText] = useState('')
  const [fEntity, setFEntity] = useState('all')
  const [fType, setFType] = useState('all')
  const [fKey, setFKey] = useState('all')
  const [fNull, setFNull] = useState('all')
  const [fRelated, setFRelated] = useState('all')
  const [preset, setPreset] = useState(null)

  const allFields = useMemo(
    () =>
      entities.flatMap((entity) =>
        entity.fields.map((field) => ({ ...field, entity: entity.name, color: entity.color })),
      ),
    [entities],
  )

  const types = useMemo(() => [...new Set(allFields.map((f) => f.type))].sort(), [allFields])

  // entity ที่เชื่อมกับ fRelated โดยตรง
  const relatedSet = useMemo(() => {
    if (fRelated === 'all') return null
    const set = new Set()
    relationships.forEach((r) => {
      if (r.fromEntity === fRelated) set.add(r.toEntity)
      if (r.toEntity === fRelated) set.add(r.fromEntity)
    })
    return set
  }, [fRelated, relationships])

  const hasRel = (entity, field) =>
    relationships.some(
      (r) =>
        (r.fromEntity === entity && r.fromField === field) ||
        (r.toEntity === entity && r.toField === field),
    )

  const activePreset = PRESETS.find((p) => p.id === preset)

  const entityResults = useMemo(() => {
    if (activePreset?.kind !== 'entity') return []
    if (preset === 'noPk') return entities.filter((e) => !e.fields.some((f) => f.key === 'PK'))
    return entities.filter(
      (e) => !relationships.some((r) => r.fromEntity === e.name || r.toEntity === e.name),
    )
  }, [activePreset, preset, entities, relationships])

  const fieldResults = useMemo(() => {
    if (activePreset?.kind === 'entity') return []
    const q = text.trim().toLowerCase()

    return allFields.filter((f) => {
      if (preset === 'fkNoRel' && !(f.key === 'FK' && !hasRel(f.entity, f.name))) return false
      if (preset === 'noDesc' && (f.description ?? '').trim() !== '') return false
      if (fEntity !== 'all' && f.entity !== fEntity) return false
      if (fType !== 'all' && f.type !== fType) return false
      if (fKey === 'none' ? Boolean(f.key) : fKey !== 'all' && f.key !== fKey) return false
      if (fNull === 'null' && f.nullable === false) return false
      if (fNull === 'notnull' && f.nullable !== false) return false
      if (relatedSet && !relatedSet.has(f.entity)) return false
      if (q && !`${f.name} ${f.type} ${f.entity} ${f.description ?? ''} ${f.defaultValue ?? ''}`.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFields, text, fEntity, fType, fKey, fNull, relatedSet, preset, activePreset, relationships])

  const clearAll = () => {
    setText('')
    setFEntity('all')
    setFType('all')
    setFKey('all')
    setFNull('all')
    setFRelated('all')
    setPreset(null)
  }

  const dirty =
    text || fEntity !== 'all' || fType !== 'all' || fKey !== 'all' || fNull !== 'all' || fRelated !== 'all' || preset

  return (
    <>
      <div className="qx-presets">
        <span className="qx-presets-label">ตรวจสอบเร็ว</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`qx-chip ${preset === p.id ? 'active' : ''}`}
            onClick={() => setPreset((cur) => (cur === p.id ? null : p.id))}
          >
            {p.label}
          </button>
        ))}
      </div>

      {activePreset?.kind !== 'entity' && (
        <div className="qx-filters">
          <div className="search-box qx-search">
            <Search size={17} />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="ค้นหาชื่อ, type, คำอธิบาย..."
            />
          </div>

          <select className="filter-select" aria-label="Entity" value={fEntity} onChange={(e) => setFEntity(e.target.value)}>
            <option value="all">ทุก Entity</option>
            {entities.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
          </select>

          <select className="filter-select" aria-label="Type" value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="all">ทุก Type</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          <select className="filter-select" aria-label="Key" value={fKey} onChange={(e) => setFKey(e.target.value)}>
            <option value="all">ทุก Key</option>
            <option value="PK">PK</option>
            <option value="FK">FK</option>
            <option value="UK">UK</option>
            <option value="none">ไม่มี Key</option>
          </select>

          <select className="filter-select" aria-label="Nullable" value={fNull} onChange={(e) => setFNull(e.target.value)}>
            <option value="all">NULL / NOT NULL</option>
            <option value="null">NULL ได้</option>
            <option value="notnull">NOT NULL</option>
          </select>

          <select className="filter-select" aria-label="Related" value={fRelated} onChange={(e) => setFRelated(e.target.value)}>
            <option value="all">เชื่อมกับ: ทั้งหมด</option>
            {entities.map((e) => <option key={e.name} value={e.name}>เชื่อมกับ {e.name}</option>)}
          </select>
        </div>
      )}

      <div className="qx-resultbar">
        <span className="result-count">
          {activePreset?.kind === 'entity'
            ? `${entityResults.length} entities`
            : `${fieldResults.length} / ${allFields.length} fields`}
        </span>
        {dirty && (
          <button type="button" className="text-button" onClick={clearAll}>
            <X size={13} /> ล้างตัวกรอง
          </button>
        )}
      </div>

      {activePreset?.kind === 'entity' ? (
        entityResults.length === 0 ? (
          <div className="qx-ok">
            <ShieldCheck size={18} /> ไม่พบรายการ — {activePreset.label} ผ่านการตรวจสอบแล้ว
          </div>
        ) : (
          <div className="qx-entity-list">
            {entityResults.map((e) => (
              <button key={e.name} type="button" className="qx-entity-item" onClick={() => onOpenEntity?.(e.name)}>
                <span className={`entity-badge ${e.color}`}>{e.name}</span>
                <small>{e.description || 'ไม่มีรายละเอียด'}</small>
                <span className="qx-open">เปิด <ArrowRight size={13} /></span>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="field-table-wrap">
          <table className="field-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Entity</th>
                <th>Type</th>
                <th>Key</th>
                <th>Null</th>
                <th>Default</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {fieldResults.map((f) => (
                <tr key={`${f.entity}.${f.name}`}>
                  <td className="field-name">{f.name}</td>
                  <td>
                    <button
                      type="button"
                      className={`entity-badge qx-badge-btn ${f.color}`}
                      title="เปิดใน Entities"
                      onClick={() => onOpenEntity?.(f.entity)}
                    >
                      {f.entity}
                    </button>
                  </td>
                  <td><span className="type-tag">{f.type}</span></td>
                  <td>{f.key && <span className={`key-tag ${f.key.toLowerCase()}`}>{f.key}</span>}</td>
                  <td>{f.nullable === false ? 'NOT NULL' : 'NULL'}</td>
                  <td>{f.defaultValue || '-'}</td>
                  <td>{f.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {fieldResults.length === 0 && (
            <p className="empty-state">
              {preset ? `ไม่พบรายการ — ${activePreset.label} ผ่านการตรวจสอบแล้ว` : 'ไม่พบ Column ที่ตรงกับเงื่อนไข'}
            </p>
          )}
        </div>
      )}
    </>
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

/* ======================================================================
   Tab 3 — SQL Console (เขียน SELECT เองกับ "ตารางเมทาดาต้า" ของโปรเจกต์)
   ต้องติดตั้ง: npm install alasql   (โหลดแบบ lazy เมื่อกด Run ครั้งแรกเท่านั้น)
   ====================================================================== */

const CONSOLE_EXAMPLES = [
  {
    label: 'จำนวน Column ต่อ Entity',
    sql: 'SELECT entity, COUNT(*) AS total_columns\nFROM fields\nGROUP BY entity\nORDER BY total_columns DESC;',
  },
  {
    label: 'ทุก FK',
    sql: "SELECT entity, column_name, data_type, description\nFROM fields\nWHERE key_type = 'FK';",
  },
  {
    label: 'Column ที่ไม่มีคำอธิบาย',
    sql: "SELECT entity, column_name, data_type\nFROM fields\nWHERE description = '';",
  },
  {
    label: 'Relationship + คำอธิบายปลายทาง',
    sql: 'SELECT r.from_entity, r.from_field, r.to_entity, r.to_field, r.type,\n       f.description AS to_description\nFROM relationships r\nLEFT JOIN fields f\n  ON f.entity = r.to_entity AND f.column_name = r.to_field;',
  },
]

const CONSOLE_SCHEMA = [
  { table: 'entities', cols: ['name', 'description', 'color', 'field_count', 'notes'] },
  {
    table: 'fields',
    cols: ['entity', 'column_name', 'data_type', 'key_type', 'nullable', 'default_value', 'description'],
  },
  {
    table: 'relationships',
    cols: ['id', 'from_entity', 'from_field', 'to_entity', 'to_field', 'type', 'label', 'detail'],
  },
]

const MAX_SHOWN_ROWS = 500

// ตรวจให้รันได้เฉพาะ SELECT คำสั่งเดียว (ตัดคอมเมนต์/สตริงออกก่อนตรวจคำต้องห้าม)
function sanitizeSelect(raw) {
  const text = raw.trim()
  if (!text) throw new Error('กรุณาพิมพ์ SQL ก่อน')

  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")

  const statements = stripped.split(';').filter((part) => part.trim())
  if (statements.length > 1) throw new Error('รันได้ครั้งละ 1 คำสั่งเท่านั้น')
  if (!/^\s*select\b/i.test(stripped)) throw new Error('รองรับเฉพาะคำสั่ง SELECT')

  const banned = stripped.match(
    /\b(insert|update|delete|drop|create|alter|attach|detach|into|csv|tsv|xlsx|xls|json|txt|html|xml|file|url|eval|javascript|require|import|load)\b/i,
  )
  if (banned) throw new Error(`ไม่อนุญาตให้ใช้คำว่า "${banned[1].toUpperCase()}" ในคำสั่ง`)

  return text.replace(/;\s*$/, '')
}

const toCsv = (cols, rows) => {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.map(cell).join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')
}

function SqlConsole({ entities, relationships }) {
  const [sql, setSql] = useState(CONSOLE_EXAMPLES[0].sql)
  const [result, setResult] = useState(null) // { cols, rows, ms }
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [copied, setCopied] = useState(false)

  const run = async () => {
    setError('')
    setRunning(true)
    try {
      const clean = sanitizeSelect(sql)
      const { default: alasql } = await import('alasql')

      const db = new alasql.Database()
      db.exec('CREATE TABLE entities')
      db.exec('CREATE TABLE fields')
      db.exec('CREATE TABLE relationships')

      db.tables.entities.data = entities.map((e) => ({
        name: e.name,
        description: e.description ?? '',
        color: e.color ?? '',
        field_count: e.fields.length,
        notes: e.notes ?? '',
      }))
      db.tables.fields.data = entities.flatMap((e) =>
        e.fields.map((f) => ({
          entity: e.name,
          column_name: f.name,
          data_type: f.type ?? '',
          key_type: f.key ?? '',
          nullable: f.nullable !== false,
          default_value: f.defaultValue ?? '',
          description: f.description ?? '',
        })),
      )
      db.tables.relationships.data = relationships.map((r) => ({
        id: r.id,
        from_entity: r.fromEntity,
        from_field: r.fromField,
        to_entity: r.toEntity,
        to_field: r.toField,
        type: r.type ?? '',
        label: r.label ?? '',
        detail: r.detail ?? '',
      }))

      const t0 = performance.now()
      const out = db.exec(clean)
      const ms = Math.round(performance.now() - t0)

      const rows = Array.isArray(out) ? out : []
      const cols = []
      rows.slice(0, 200).forEach((row) => {
        Object.keys(row ?? {}).forEach((k) => {
          if (!cols.includes(k)) cols.push(k)
        })
      })
      setResult({ cols, rows, ms })
    } catch (err) {
      setResult(null)
      setError(err?.message ? String(err.message) : 'คำสั่ง SQL ไม่ถูกต้อง')
    } finally {
      setRunning(false)
    }
  }

  const handleKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      run()
    }
  }

  const handleCopyCsv = async () => {
    if (!result) return
    try {
      await copyText(toCsv(result.cols, result.rows))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      alert('คัดลอกไม่สำเร็จ')
    }
  }

  const renderCell = (value) => {
    if (value === null || value === undefined) return <span className="qx-null">NULL</span>
    if (typeof value === 'boolean') return String(value)
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  return (
    <div className="qx-console">
      <div className="qx-console-main">
        <div className="qx-presets qx-presets-tight">
          <span className="qx-presets-label">ตัวอย่าง</span>
          {CONSOLE_EXAMPLES.map((ex) => (
            <button key={ex.label} type="button" className="qx-chip" onClick={() => setSql(ex.sql)}>
              {ex.label}
            </button>
          ))}
        </div>

        <textarea
          className="qx-editor"
          spellCheck={false}
          rows={8}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="SELECT * FROM fields WHERE data_type = 'varchar';"
        />

        <div className="qx-editor-bar">
          <span className="qx-muted">Ctrl / ⌘ + Enter เพื่อรัน · รองรับ SELECT, WHERE, JOIN, GROUP BY, ORDER BY, LIMIT</span>
          <button type="button" className="primary-button qx-small" onClick={run} disabled={running}>
            {running ? 'กำลังรัน…' : 'Run query'}
          </button>
        </div>

        {error && <div className="qx-error">{error}</div>}

        {result && (
          <>
            <div className="qx-resultbar qx-resultbar-flush">
              <span className="result-count">
                {result.rows.length} แถว · {result.ms} ms
                {result.rows.length > MAX_SHOWN_ROWS ? ` · แสดง ${MAX_SHOWN_ROWS} แถวแรก` : ''}
              </span>
              {result.rows.length > 0 && (
                <button type="button" className="text-button" onClick={handleCopyCsv}>
                  {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'คัดลอกแล้ว' : 'Copy CSV'}
                </button>
              )}
            </div>
            <div className="field-table-wrap">
              {result.rows.length === 0 ? (
                <p className="empty-state">ไม่พบข้อมูลที่ตรงกับคำสั่ง</p>
              ) : (
                <table className="field-table">
                  <thead>
                    <tr>{result.cols.map((c) => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, MAX_SHOWN_ROWS).map((row, i) => (
                      <tr key={i}>
                        {result.cols.map((c) => <td key={c}>{renderCell(row[c])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      <aside className="qx-schema">
        <strong>ตารางที่ Query ได้</strong>
        <p className="qx-muted">ข้อมูลมาจากเอกสารของโปรเจกต์นี้ ไม่ใช่ฐานข้อมูลจริง</p>
        {CONSOLE_SCHEMA.map((t) => (
          <div key={t.table} className="qx-schema-table">
            <button type="button" className="qx-schema-name" onClick={() => setSql(`SELECT * FROM ${t.table};`)}>
              {t.table}
            </button>
            <ul>
              {t.cols.map((c) => <li key={c}><code>{c}</code></li>)}
            </ul>
          </div>
        ))}
      </aside>
    </div>
  )
}