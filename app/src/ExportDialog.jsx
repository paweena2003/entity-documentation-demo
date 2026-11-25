import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Download, X } from 'lucide-react'
import { buildSql } from './exportImport'
import {
  CSV_COLUMNS,
  NAME_CASES,
  NULLABLE_STYLES,
  applyExportRenames,
  buildCustomCsv,
} from './ioMapping'
import './Mapping.css'

const PREVIEW_LINES = 40

// หน้าต่างตั้งค่าก่อนส่งออก: kind = 'sql' (เปลี่ยนชื่อตาราง/คอลัมน์ เลือกตาราง) หรือ 'csv' (ตั้งหัวคอลัมน์เอง)
export default function ExportDialog({ kind, dialect = 'postgres', entities, relationships, projectName, fileBase, onDownload, onClose }) {
  return (
    <div className="project-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="project-modal export-modal" role="dialog" aria-modal="true">
        {kind === 'sql' ? (
          <SqlExport
            dialect={dialect}
            entities={entities}
            relationships={relationships}
            projectName={projectName}
            fileBase={fileBase}
            onDownload={onDownload}
            onClose={onClose}
          />
        ) : (
          <CsvExport
            entities={entities}
            relationships={relationships}
            fileBase={fileBase}
            onDownload={onDownload}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

function Header({ title, subtitle, onClose }) {
  return (
    <div className="project-modal-header">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <button type="button" className="icon-button" onClick={onClose} aria-label="ปิด"><X size={16} /></button>
    </div>
  )
}

/* ---------------------------- SQL ---------------------------- */
function SqlExport({ dialect, entities, relationships, projectName, fileBase, onDownload, onClose }) {
  const [included, setIncluded] = useState(() => new Set(entities.map((e) => e.name)))
  const [tableNames, setTableNames] = useState({})
  const [columnNames, setColumnNames] = useState({})
  const [open, setOpen] = useState(null)
  const [caseMode, setCaseMode] = useState('keep')
  const [prefix, setPrefix] = useState('')

  const label = dialect === 'mysql' ? 'MySQL / MariaDB' : 'PostgreSQL'

  const toggle = (name) =>
    setIncluded((cur) => {
      const next = new Set(cur)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  // ปุ่มลัด: ตั้งชื่อทั้งหมดตามรูปแบบที่เลือก (+ คำนำหน้าตาราง)
  const applyBulk = () => {
    const fn = NAME_CASES[caseMode].fn
    const t = {}
    const c = {}
    entities.forEach((e) => {
      t[e.name] = `${prefix.trim()}${fn(e.name)}`
      e.fields.forEach((f) => {
        c[`${e.name}.${f.name}`] = fn(f.name)
      })
    })
    setTableNames(t)
    setColumnNames(c)
  }
  const resetNames = () => {
    setTableNames({})
    setColumnNames({})
    setPrefix('')
    setCaseMode('keep')
  }

  const renamed = useMemo(
    () => applyExportRenames(entities, relationships, { tableNames, columnNames, included }),
    [entities, relationships, tableNames, columnNames, included],
  )

  // ชื่อซ้ำหลังเปลี่ยน → SQL รันไม่ได้ ต้องเตือน
  const problems = useMemo(() => {
    const list = []
    const seen = new Set()
    renamed.entities.forEach((e) => {
      const key = e.name.toLowerCase()
      if (seen.has(key)) list.push(`ชื่อตารางซ้ำ: ${e.name}`)
      seen.add(key)
      const cols = new Set()
      e.fields.forEach((f) => {
        const ck = f.name.toLowerCase()
        if (cols.has(ck)) list.push(`ตาราง ${e.name} มีคอลัมน์ชื่อซ้ำ: ${f.name}`)
        cols.add(ck)
      })
    })
    return list
  }, [renamed])

  const sql = useMemo(() => {
    if (!renamed.entities.length) return ''
    try {
      return buildSql(renamed.entities, renamed.relationships, dialect, projectName)
    } catch (error) {
      return `-- สร้าง SQL ไม่สำเร็จ: ${error.message}`
    }
  }, [renamed, dialect, projectName])

  const previewLines = sql.split('\n')
  const preview = previewLines.slice(0, PREVIEW_LINES).join('\n')
  const dropped = relationships.length - renamed.relationships.length

  const download = () => {
    if (!sql || problems.length) return
    onDownload(`${fileBase}_${dialect}.sql`, sql, 'text/sql;charset=utf-8')
    onClose()
  }

  return (
    <>
      <Header
        title={`ส่งออก SQL — ${label}`}
        subtitle="เลือกตารางและเปลี่ยนชื่อตาราง/คอลัมน์ได้ก่อนสร้างไฟล์ (ไม่กระทบข้อมูลในโปรเจกต์)"
        onClose={onClose}
      />

      <div className="export-bulk">
        <label>
          รูปแบบชื่อ
          <select className="filter-select" value={caseMode} onChange={(e) => setCaseMode(e.target.value)}>
            {Object.entries(NAME_CASES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label>
          คำนำหน้าชื่อตาราง
          <input className="qx-input" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="เช่น app_" />
        </label>
        <button type="button" className="secondary-button" onClick={applyBulk}>ใช้กับทุกชื่อ</button>
        <button type="button" className="text-button" onClick={resetNames}>คืนค่าเดิม</button>
      </div>

      <div className="export-list">
        {entities.map((e) => {
          const on = included.has(e.name)
          const expanded = open === e.name
          return (
            <div key={e.name} className={`export-entity ${on ? '' : 'off'}`}>
              <div className="export-entity-row">
                <input type="checkbox" checked={on} onChange={() => toggle(e.name)} aria-label={`ส่งออก ${e.name}`} />
                <span className="export-orig">{e.name}</span>
                <span className="export-to">→</span>
                <input
                  className="qx-input"
                  disabled={!on}
                  value={tableNames[e.name] ?? e.name}
                  onChange={(ev) => setTableNames((cur) => ({ ...cur, [e.name]: ev.target.value }))}
                />
                <button type="button" className="text-button" onClick={() => setOpen(expanded ? null : e.name)}>
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} คอลัมน์ ({e.fields.length})
                </button>
              </div>

              {expanded && (
                <div className="export-fields">
                  {e.fields.map((f) => {
                    const k = `${e.name}.${f.name}`
                    return (
                      <div key={k} className="export-field-row">
                        <span className="export-orig">{f.name}</span>
                        <span className="export-to">→</span>
                        <input
                          className="qx-input"
                          disabled={!on}
                          value={columnNames[k] ?? f.name}
                          onChange={(ev) => setColumnNames((cur) => ({ ...cur, [k]: ev.target.value }))}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {dropped > 0 && (
        <p className="mapper-warn">
          Relationship {dropped} รายการไม่ถูกใส่เป็น FOREIGN KEY เพราะตารางปลายทางข้างใดข้างหนึ่งไม่ได้ถูกเลือก
        </p>
      )}
      {problems.length > 0 && <p className="mapper-warn">{problems.slice(0, 3).join(' · ')}</p>}

      <div className="export-preview-head">
        <strong>ตัวอย่างไฟล์</strong>
        <small>
          {previewLines.length > PREVIEW_LINES ? `แสดง ${PREVIEW_LINES} จาก ${previewLines.length} บรรทัด` : `${previewLines.length} บรรทัด`}
        </small>
      </div>
      <pre className="qx-sql export-preview"><code>{preview || '-- ยังไม่ได้เลือกตาราง'}</code></pre>

      <div className="project-modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>ยกเลิก</button>
        <button type="button" className="primary-button" disabled={!sql || problems.length > 0} onClick={download}>
          <Download size={15} /> ดาวน์โหลด .sql
        </button>
      </div>
    </>
  )
}

/* ---------------------------- CSV ---------------------------- */
function CsvExport({ entities, relationships, fileBase, onDownload, onClose }) {
  const [columns, setColumns] = useState(() =>
    CSV_COLUMNS.map((c) => ({ ...c, include: c.key !== 'references' })),
  )
  const [nullableStyle, setNullableStyle] = useState('nullNotNull')

  const update = (key, patch) =>
    setColumns((cur) => cur.map((c) => (c.key === key ? { ...c, ...patch } : c)))

  const move = (index, dir) =>
    setColumns((cur) => {
      const j = index + dir
      if (j < 0 || j >= cur.length) return cur
      const copy = [...cur]
      ;[copy[index], copy[j]] = [copy[j], copy[index]]
      return copy
    })

  const csv = useMemo(
    () => buildCustomCsv(entities, relationships, columns, nullableStyle),
    [entities, relationships, columns, nullableStyle],
  )
  const lines = csv.replace(/^﻿/, '').split('\r\n')
  const labels = columns.filter((c) => c.include).map((c) => c.label.trim())
  const duplicateHeader = new Set(labels.map((l) => l.toLowerCase())).size !== labels.length
  const none = labels.length === 0

  const download = () => {
    if (none) return
    onDownload(`${fileBase}_data_dictionary.csv`, csv, 'text/csv;charset=utf-8')
    onClose()
  }

  return (
    <>
      <Header
        title="ส่งออก Data Dictionary (CSV)"
        subtitle="เลือกคอลัมน์ที่จะส่งออก ตั้งชื่อหัวคอลัมน์เอง และจัดลำดับได้"
        onClose={onClose}
      />

      <div className="export-list">
        {columns.map((c, i) => {
          const original = CSV_COLUMNS.find((x) => x.key === c.key)?.label
          return (
            <div key={c.key} className={`export-entity ${c.include ? '' : 'off'}`}>
              <div className="export-entity-row">
                <input
                  type="checkbox"
                  checked={c.include}
                  onChange={(e) => update(c.key, { include: e.target.checked })}
                  aria-label={`ส่งออก ${original}`}
                />
                <span className="export-orig">{original}</span>
                <span className="export-to">→</span>
                <input
                  className="qx-input"
                  disabled={!c.include}
                  value={c.label}
                  onChange={(e) => update(c.key, { label: e.target.value })}
                  placeholder={original}
                />
                <span className="export-move">
                  <button type="button" className="icon-button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="เลื่อนขึ้น"><ArrowUp size={14} /></button>
                  <button type="button" className="icon-button" onClick={() => move(i, 1)} disabled={i === columns.length - 1} aria-label="เลื่อนลง"><ArrowDown size={14} /></button>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="export-bulk">
        <label>
          รูปแบบค่า Nullable
          <select className="filter-select" value={nullableStyle} onChange={(e) => setNullableStyle(e.target.value)}>
            {Object.entries(NULLABLE_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>

      {duplicateHeader && <p className="mapper-warn">มีหัวคอลัมน์ชื่อซ้ำกัน ควรตั้งให้ต่างกันเพื่อให้นำไปใช้ต่อได้ง่าย</p>}

      <div className="export-preview-head">
        <strong>ตัวอย่างไฟล์</strong>
        <small>{Math.max(lines.length - 1, 0)} แถวข้อมูล</small>
      </div>
      <pre className="qx-sql export-preview"><code>{none ? '(ยังไม่ได้เลือกคอลัมน์)' : lines.slice(0, 6).join('\n')}</code></pre>

      <div className="project-modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>ยกเลิก</button>
        <button type="button" className="primary-button" disabled={none} onClick={download}>
          <Download size={15} /> ดาวน์โหลด .csv
        </button>
      </div>
    </>
  )
}