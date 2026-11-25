import { useMemo, useState } from 'react'
import { ArrowRight, Upload, Sparkles } from 'lucide-react'
import { TARGET_FIELDS, guessMapping, buildMappedRows, mergeMappedRows } from './ioMapping'
import './Mapping.css'

const baseName = (fileName) => String(fileName ?? '').replace(/\.[^.]+$/, '').trim()

// หน้าจับคู่คอลัมน์ก่อนนำเข้า: ซ้าย = คอลัมน์ในไฟล์ / ขวา = ฟิลด์ของ Entity Portal
export default function ImportMapper({ table, fileName, entities, canEdit, makeEntity, onApply, onCancel }) {
  const [mapping, setMapping] = useState(() => guessMapping(table.headers))
  const [defaultEntity, setDefaultEntity] = useState(() => baseName(fileName))
  const [fillEmpty, setFillEmpty] = useState(true)
  const [nullableInverted, setNullableInverted] = useState(() => {
    const idx = guessMapping(table.headers).nullable
    const h = idx >= 0 ? table.headers[idx].toLowerCase().replace(/[\s_-]+/g, '') : ''
    return h === 'notnull' || h === 'required'
  })

  const setTarget = (key, value) => setMapping((cur) => ({ ...cur, [key]: Number(value) }))
  const autoGuess = () => setMapping(guessMapping(table.headers))

  const samples = (index) =>
    index < 0
      ? ''
      : table.rows
          .map((r) => r[index])
          .filter(Boolean)
          .slice(0, 3)
          .join(' · ')

  const built = useMemo(
    () => buildMappedRows(table, mapping, { defaultEntity, nullableInverted }),
    [table, mapping, defaultEntity, nullableInverted],
  )
  const merged = useMemo(
    () => mergeMappedRows(entities, built.rows, makeEntity, { fillEmpty }),
    [entities, built.rows, makeEntity, fillEmpty],
  )

  const needEntityName = mapping.entity < 0
  const missingField = mapping.field < 0
  const blocked = !canEdit || missingField || built.rows.length === 0 || (needEntityName && !defaultEntity.trim())

  const confirm = () => {
    if (blocked) return
    onApply(merged, { fileName, rows: built.rows.length })
  }

  return (
    <div className="io-preview mapper">
      <div className="mapper-head">
        <div>
          <strong>{fileName}</strong>
          <small>
            พบ {table.headers.length} คอลัมน์ · {table.rows.length} แถว — เลือกว่าคอลัมน์ไหนในไฟล์ (ซ้าย)
            จะเข้าฟิลด์ไหนของ Entity Portal (ขวา)
          </small>
        </div>
        <button type="button" className="secondary-button mapper-auto" onClick={autoGuess}>
          <Sparkles size={14} /> เดาให้ใหม่
        </button>
      </div>

      <div className="mapper-rows">
        {TARGET_FIELDS.map((t) => {
          const index = mapping[t.key]
          return (
            <div className="mapper-row" key={t.key}>
              <div className="mapper-source">
                <select
                  className="filter-select"
                  value={index}
                  onChange={(e) => setTarget(t.key, e.target.value)}
                  aria-label={`คอลัมน์ในไฟล์สำหรับ ${t.label}`}
                >
                  <option value={-1}>— ไม่นำเข้า —</option>
                  {table.headers.map((h, i) => (
                    <option key={i} value={i}>{h}</option>
                  ))}
                </select>
                {index >= 0 && <small title={samples(index)}>ตัวอย่าง: {samples(index) || '(ว่าง)'}</small>}
              </div>
              <ArrowRight size={15} className="mapper-arrow" />
              <div className="mapper-target">
                <strong>{t.label}{t.required && <span className="mapper-req"> *</span>}</strong>
                {t.hint && <small>{t.hint}</small>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mapper-options">
        {needEntityName && (
          <label className="mapper-option">
            ชื่อ Entity ที่จะนำเข้า
            <input
              className="qx-input"
              value={defaultEntity}
              onChange={(e) => setDefaultEntity(e.target.value)}
              placeholder="เช่น USERS"
            />
          </label>
        )}
        {mapping.nullable >= 0 && (
          <label className="mapper-check">
            <input type="checkbox" checked={nullableInverted} onChange={(e) => setNullableInverted(e.target.checked)} />
            ค่าในช่อง Nullable ความหมายกลับกัน (เช่น คอลัมน์ “required / not null” ที่ yes = ห้ามว่าง)
          </label>
        )}
        <label className="mapper-check">
          <input type="checkbox" checked={fillEmpty} onChange={(e) => setFillEmpty(e.target.checked)} />
          Column ที่มีอยู่แล้ว: เติมคำอธิบาย/ค่า Default ให้ถ้าของเดิมยังว่าง (ไม่เขียนทับของเดิม)
        </label>
      </div>

      {missingField && <p className="mapper-warn">ต้องเลือกคอลัมน์สำหรับ Field (ชื่อคอลัมน์) ก่อนจึงจะนำเข้าได้</p>}

      <div className="io-preview-stats">
        <span>{built.rows.length} แถวที่นำเข้าได้</span>
        <span>เพิ่ม Entity ใหม่ {merged.addedEntities}</span>
        <span>เพิ่ม Column {merged.addedFields}</span>
        <span>เติมข้อมูลให้ Column เดิม {merged.filledFields}</span>
        <span>ข้าม (ซ้ำ) {merged.skippedFields - merged.filledFields}</span>
      </div>

      {built.warnings.length > 0 && (
        <ul className="io-warnings">
          {built.warnings.slice(0, 30).map((w, i) => <li key={i}>{w}</li>)}
          {built.warnings.length > 30 && <li>…และอีก {built.warnings.length - 30} รายการ</li>}
        </ul>
      )}

      {built.rows.length > 0 && (
        <div className="field-table-wrap">
          <table className="field-table">
            <thead>
              <tr><th>Entity</th><th>Field</th><th>Type</th><th>Key</th><th>Null</th><th>Description</th></tr>
            </thead>
            <tbody>
              {built.rows.slice(0, 8).map((r, i) => (
                <tr key={i}>
                  <td>{r.entity}</td>
                  <td className="field-name">{r.field}</td>
                  <td><span className="type-tag">{r.type}</span></td>
                  <td>{r.key && <span className={`key-tag ${r.key.toLowerCase()}`}>{r.key}</span>}</td>
                  <td>{r.nullable ? 'NULL' : 'NOT NULL'}</td>
                  <td>{r.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="io-preview-actions">
        <button type="button" className="primary-button" disabled={blocked} onClick={confirm}>
          <Upload size={15} /> ยืนยันนำเข้า
        </button>
        <button type="button" className="secondary-button" onClick={onCancel}>ยกเลิก</button>
      </div>
    </div>
  )
}