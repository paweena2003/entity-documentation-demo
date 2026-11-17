import { useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  Download,
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { renderMarkdown } from './markdown'
import { exportPdf, exportWord } from './exportDoc'
import './Documentation.css'

const DEFAULT_GROUPS = ['DATABASE DOCUMENTATION', 'ENTITIES', 'TECHNICAL DOCUMENTATION']

// ===== Template generators (ดึงข้อมูลจาก Entity / Relationship จริง) =====
const cell = (value) => String(value ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')

const sampleValue = (field) => {
  switch ((field.type || '').toLowerCase()) {
    case 'int':
    case 'bigint':
      return 1
    case 'boolean':
      return true
    case 'decimal':
      return 0.0
    case 'date':
      return '2026-01-01'
    case 'datetime':
      return '2026-01-01T00:00:00Z'
    case 'uuid':
      return '00000000-0000-0000-0000-000000000000'
    default:
      return 'example'
  }
}

const fieldsBody = (entity) => {
  if (!entity.fields.length) return 'ยังไม่มี Column'
  const rows = entity.fields.map(
    (f) =>
      `| \`${cell(f.name)}\` | ${cell(f.type)} | ${cell(f.key) || '-'} | ${
        f.nullable === false ? 'NOT NULL' : 'NULL'
      } | ${cell(f.defaultValue) || '-'} | ${cell(f.description) || '-'} |`,
  )
  return [
    '| Field | Data Type | Key | Nullable | Default | Description |',
    '|---|---|---|---|---|---|',
    ...rows,
  ].join('\n')
}

const keysBody = (entity, relationships) => {
  const list = (items) => (items.length ? items.join('\n') : '- ไม่มี')
  const pk = entity.fields.filter((f) => f.key === 'PK').map((f) => `- \`${f.name}\``)
  const uk = entity.fields.filter((f) => f.key === 'UK').map((f) => `- \`${f.name}\``)
  const fk = entity.fields
    .filter((f) => f.key === 'FK')
    .map((f) => {
      const rel = relationships.find((r) => r.toEntity === entity.name && r.toField === f.name)
      return rel ? `- \`${f.name}\` → \`${rel.fromEntity}.${rel.fromField}\`` : `- \`${f.name}\``
    })

  const parts = ['### Primary Key', '', list(pk), '', '### Foreign Key', '', list(fk)]
  if (uk.length) parts.push('', '### Unique Key', '', list(uk))
  return parts.join('\n')
}

const relationshipsBody = (entity, relationships) => {
  const related = relationships.filter(
    (r) => r.fromEntity === entity.name || r.toEntity === entity.name,
  )
  if (!related.length) return 'ยังไม่มี Relationship'

  return related
    .map((r) =>
      [
        `### ${r.fromEntity} to ${r.toEntity}`,
        '',
        `- **Type:** ${r.type}`,
        `- **Fields:** \`${r.fromEntity}.${r.fromField}\` → \`${r.toEntity}.${r.toField}\``,
        r.label ? `- **Name:** ${r.label}` : null,
        r.detail ? `- **Description:** ${r.detail}` : null,
      ]
        .filter((line) => line !== null)
        .join('\n'),
    )
    .join('\n\n')
}

// หัวข้อที่ดึงจาก Entity จริง (ใช้ทั้งตอนซิงก์ และตอนตรวจว่าหน้า Doc ไม่ตรงกับ Entity)
const SYNC_SECTIONS = [
  ['Fields', (entity) => fieldsBody(entity)],
  ['Keys', (entity, relationships) => keysBody(entity, relationships)],
  ['Relationships', (entity, relationships) => relationshipsBody(entity, relationships)],
]

const buildEntityDoc = (entity, relationships) => {
  const example = Object.fromEntries(entity.fields.map((f) => [f.name, sampleValue(f)]))
  const relatedNames = [
    ...new Set(
      relationships
        .filter((r) => r.fromEntity === entity.name || r.toEntity === entity.name)
        .map((r) => (r.fromEntity === entity.name ? r.toEntity : r.fromEntity))
        .filter((n) => n !== entity.name),
    ),
  ]

  return [
    '## 1. Overview',
    '',
    entity.description || `Entity ${entity.name}`,
    '',
    '## 2. Responsibilities',
    '',
    '- (ระบุหน้าที่ของ Entity นี้)',
    '',
    '## 3. Fields',
    '',
    fieldsBody(entity),
    '',
    '## 4. Keys',
    '',
    keysBody(entity, relationships),
    '',
    '## 5. Relationships',
    '',
    relationshipsBody(entity, relationships),
    '',
    '## 6. Business Rules',
    '',
    '- (ระบุกฎทางธุรกิจ เช่น ค่าที่เป็นไปได้ของ status)',
    '',
    '## 7. Example',
    '',
    '```json',
    JSON.stringify(example, null, 2),
    '```',
    '',
    '## 8. Related Documentation',
    '',
    relatedNames.length ? relatedNames.map((n) => `- ${n}`).join('\n') : '- ไม่มี',
    '',
    '## 9. Review Status',
    '',
    '| Item | Detail |',
    '|---|---|',
    '| Status | Draft |',
    '| Reviewer | - |',
    `| Last updated | ${new Date().toISOString().slice(0, 10)} |`,
    '',
  ].join('\n')
}

const sectionRegex = (name) => new RegExp(`^##\\s+(?:\\d+\\.\\s*)?${name}\\s*$`, 'i')

// แทนที่เนื้อหาใต้หัวข้อ "## n. Name" โดยคงบรรทัดหัวข้อเดิมไว้
const replaceSectionBody = (content, name, body) => {
  const lines = content.split('\n')
  const start = lines.findIndex((l) => sectionRegex(name).test(l))
  if (start === -1) return null

  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l))
  if (end === -1) end = lines.length

  return [...lines.slice(0, start + 1), '', ...body.split('\n'), '', ...lines.slice(end)].join('\n')
}

// อ่านเนื้อหาใต้หัวข้อ (null ถ้าไม่มีหัวข้อนั้น)
const getSectionBody = (content, name) => {
  const lines = content.split('\n')
  const start = lines.findIndex((l) => sectionRegex(name).test(l))
  if (start === -1) return null

  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l))
  if (end === -1) end = lines.length

  return lines.slice(start + 1, end).join('\n')
}

// เทียบโดยไม่สนช่องว่างและบรรทัดว่าง
const norm = (text) =>
  String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')

const makeDoc = (title, group, content, displayName) => ({
  id: crypto.randomUUID(),
  title,
  group,
  content,
  updatedAt: new Date().toISOString(),
  updatedBy: displayName,
})

// ===== Component =====
export default function Documentation({
  docs = [],
  setDocs,
  entities = [],
  relationships = [],
  displayName = '',
  projectName = '',
  onLog = () => {},
  readOnly = false,
}) {
  const [activeId, setActiveId] = useState(null)
  const [mode, setMode] = useState('preview') // preview | edit
  const [modal, setModal] = useState(null) // null | { type: 'create' } | { type: 'rename', doc }
  const [title, setTitle] = useState('')
  const [group, setGroup] = useState('')
  const [template, setTemplate] = useState('blank')
  const [search, setSearch] = useState('')
  const [showExport, setShowExport] = useState(false)

  const textareaRef = useRef(null)
  const focusContentRef = useRef('')

  const activeMode = readOnly ? 'preview' : mode
  const activeDoc = docs.find((d) => d.id === activeId) ?? docs[0] ?? null
  const rendered = useMemo(() => renderMarkdown(activeDoc?.content ?? ''), [activeDoc?.content])
  const toc = rendered.headings.filter((h) => h.level >= 2 && h.level <= 3)

  const allGroups = useMemo(
    () => [...new Set([...DEFAULT_GROUPS, ...docs.map((d) => d.group || 'GENERAL')])],
    [docs],
  )

  const groupedDocs = useMemo(() => {
    const q = search.trim().toLowerCase()
    const map = new Map()
    docs
      .filter((d) => !q || `${d.title} ${d.content}`.toLowerCase().includes(q))
      .forEach((d) => {
        const g = d.group || 'GENERAL'
        if (!map.has(g)) map.set(g, [])
        map.get(g).push(d)
      })
    return [...map.entries()]
  }, [docs, search])

  // ทุกหน้าเรียงตามกลุ่มเหมือน Sidebar (ใช้ตอนส่งออกรวมไฟล์เดียว)
  const orderedDocs = () =>
    allGroups.flatMap((g) => docs.filter((d) => (d.group || 'GENERAL') === g))

  const runExport = (fn) => {
    setShowExport(false)
    fn()
  }

  const missingEntities = entities.filter(
    (entity) =>
      !docs.some((d) => d.group === 'ENTITIES' && d.title.toLowerCase() === entity.name.toLowerCase()),
  )

  const matchedEntity = activeDoc
    ? entities.find((e) => e.name.toLowerCase() === activeDoc.title.toLowerCase())
    : null

  // หน้า Doc ของกลุ่ม ENTITIES ที่หัวข้อ Fields / Keys / Relationships ไม่ตรงกับ Entity ล่าสุด
  const staleMap = useMemo(() => {
    const map = new Map()
    docs.forEach((d) => {
      if (d.group !== 'ENTITIES') return
      const entity = entities.find((e) => e.name.toLowerCase() === d.title.toLowerCase())
      if (!entity) return
      const stale = SYNC_SECTIONS.filter(([name, build]) => {
        const current = getSectionBody(d.content ?? '', name)
        return current !== null && norm(current) !== norm(build(entity, relationships))
      }).map(([name]) => name)
      if (stale.length) map.set(d.id, stale)
    })
    return map
  }, [docs, entities, relationships])

  const activeStale = activeDoc ? staleMap.get(activeDoc.id) : null

  // ---------- modal ----------
  const openCreate = () => {
    setTitle('')
    setGroup(activeDoc?.group || 'DATABASE DOCUMENTATION')
    setTemplate('blank')
    setModal({ type: 'create' })
  }

  const openRename = (doc) => {
    setTitle(doc.title)
    setGroup(doc.group || 'GENERAL')
    setModal({ type: 'rename', doc })
  }

  const closeModal = () => setModal(null)

  const handleTemplateChange = (value) => {
    setTemplate(value)
    if (value !== 'blank') {
      if (!title.trim()) setTitle(value)
      setGroup('ENTITIES')
    }
  }

  const handleSaveModal = (event) => {
    event.preventDefault()
    if (readOnly) return
    const name = title.trim()
    const groupName = group.trim() || 'GENERAL'
    if (!name) return

    const duplicate = docs.some(
      (d) =>
        d.title.toLowerCase() === name.toLowerCase() &&
        (d.group || 'GENERAL') === groupName &&
        d.id !== modal.doc?.id,
    )
    if (duplicate) {
      alert('มีหน้าชื่อนี้ในกลุ่มนี้อยู่แล้ว')
      return
    }

    if (modal.type === 'rename') {
      setDocs((current) =>
        current.map((d) => (d.id === modal.doc.id ? { ...d, title: name, group: groupName } : d)),
      )
      onLog('update', 'doc', `${groupName} / ${name}`, `แก้ไขหน้า Doc ${name}`)
    } else {
      const entity = template !== 'blank' ? entities.find((e) => e.name === template) : null
      const content = entity ? buildEntityDoc(entity, relationships) : '## 1. Overview\n\n'
      const doc = makeDoc(name, groupName, content, displayName)
      setDocs((current) => [...current, doc])
      setActiveId(doc.id)
      setMode('edit')
      onLog('create', 'doc', `${groupName} / ${name}`, `สร้างหน้า Doc ${name}`)
    }

    closeModal()
  }

  // ---------- actions ----------
  const createForAllEntities = () => {
    if (readOnly || !missingEntities.length) return
    const created = missingEntities.map((entity) =>
      makeDoc(entity.name, 'ENTITIES', buildEntityDoc(entity, relationships), displayName),
    )
    setDocs((current) => [...current, ...created])
    setActiveId(created[0].id)
    setMode('preview')
    onLog('create', 'doc', 'ENTITIES', `สร้างหน้า Doc ให้ ${created.length} Entity`)
  }

  const handleDelete = () => {
    if (readOnly || !activeDoc) return
    if (!window.confirm(`ต้องการลบหน้า "${activeDoc.title}" ใช่หรือไม่?`)) return
    setDocs((current) => current.filter((d) => d.id !== activeDoc.id))
    onLog('delete', 'doc', `${activeDoc.group} / ${activeDoc.title}`, `ลบหน้า Doc ${activeDoc.title}`)
    setActiveId(null)
  }

  const moveDoc = (direction) => {
    if (readOnly || !activeDoc) return
    setDocs((current) => {
      const index = current.findIndex((d) => d.id === activeDoc.id)
      const g = current[index].group
      let j = index + direction
      while (j >= 0 && j < current.length && current[j].group !== g) j += direction
      if (j < 0 || j >= current.length) return current
      const copy = [...current]
      ;[copy[index], copy[j]] = [copy[j], copy[index]]
      return copy
    })
  }

  const updateContent = (content) => {
    if (readOnly || !activeDoc) return
    setDocs((current) =>
      current.map((d) =>
        d.id === activeDoc.id
          ? { ...d, content, updatedAt: new Date().toISOString(), updatedBy: displayName }
          : d,
      ),
    )
  }

  const syncFromEntity = () => {
    if (readOnly || !activeDoc || !matchedEntity) return
    if (
      !window.confirm(
        'อัปเดตหัวข้อ Fields, Keys และ Relationships ในหน้านี้จากข้อมูล Entity ล่าสุด?\n(เนื้อหาใต้หัวข้อเหล่านี้จะถูกแทนที่)',
      )
    )
      return

    let next = activeDoc.content
    const missing = []
    SYNC_SECTIONS.forEach(([name, build]) => {
      const replaced = replaceSectionBody(next, name, build(matchedEntity, relationships))
      if (replaced === null) missing.push(name)
      else next = replaced
    })

    updateContent(next)
    onLog('update', 'doc', `${activeDoc.group} / ${activeDoc.title}`, `ซิงก์หน้า Doc ${activeDoc.title} จาก Entity`)
    if (missing.length) alert(`ไม่พบหัวข้อ: ${missing.join(', ')} (ข้ามไป)`)
  }

  const exportMarkdown = () => {
    if (!activeDoc) return
    const text = `# ${activeDoc.title}\n\n${activeDoc.content}`
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeDoc.title.replace(/[\\/:*?"<>|]+/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const scrollToHeading = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ---------- editor toolbar ----------
  const wrapSelection = (before, after, placeholder) => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e, value } = ta
    const selected = value.slice(s, e) || placeholder
    updateContent(value.slice(0, s) + before + selected + after + value.slice(e))
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(s + before.length, s + before.length + selected.length)
    })
  }

  const prefixLine = (prefix) => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: s, value } = ta
    const lineStart = value.lastIndexOf('\n', s - 1) + 1
    updateContent(value.slice(0, lineStart) + prefix + value.slice(lineStart))
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(s + prefix.length, s + prefix.length)
    })
  }

  const insertBlock = (text) => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e, value } = ta
    const lead = s === 0 || value[s - 1] === '\n' ? '' : '\n'
    const insert = `${lead}${text}\n`
    updateContent(value.slice(0, s) + insert + value.slice(e))
    requestAnimationFrame(() => {
      ta.focus()
      const pos = s + insert.length
      ta.setSelectionRange(pos, pos)
    })
  }

  const toolbar = [
    { label: 'H2', title: 'หัวข้อใหญ่', run: () => prefixLine('## ') },
    { label: 'H3', title: 'หัวข้อย่อย', run: () => prefixLine('### ') },
    { label: 'B', title: 'ตัวหนา', run: () => wrapSelection('**', '**', 'ข้อความ') },
    { label: '</>', title: 'Inline code', run: () => wrapSelection('`', '`', 'code') },
    { label: '• List', title: 'Bullet list', run: () => prefixLine('- ') },
    { label: '1. List', title: 'Numbered list', run: () => prefixLine('1. ') },
    { label: 'Link', title: 'ลิงก์', run: () => wrapSelection('[', '](https://)', 'ข้อความลิงก์') },
    {
      label: 'Table',
      title: 'ตาราง',
      run: () => insertBlock('| หัวข้อ | รายละเอียด |\n|---|---|\n|  |  |'),
    },
    { label: 'Code block', title: 'Code block', run: () => insertBlock('```\n\n```') },
  ]

  // ---------- render ----------
  return (
    <div className={`docs-layout ${docs.length === 0 ? 'is-empty' : ''}`}>
      {docs.length > 0 && (
        <aside className="docs-sidebar">
          <div className="docs-sidebar-head">
            <div className="search-box">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหาเอกสาร..."
              />
            </div>
            {!readOnly && (
              <button type="button" className="primary-button" onClick={openCreate}>
                <Plus size={16} /> เพิ่มหน้า
              </button>
            )}
          </div>

          {groupedDocs.map(([g, items]) => (
            <div className="docs-group" key={g}>
              <div className="docs-group-label">{g}</div>
              {items.map((d) => (
                <button
                  type="button"
                  key={d.id}
                  className={`docs-link ${d.id === activeDoc?.id ? 'active' : ''}`}
                  onClick={() => setActiveId(d.id)}
                >
                  {d.title}
                  {staleMap.has(d.id) && (
                    <span
                      className="docs-stale-dot"
                      title={`ไม่ตรงกับ Entity: ${staleMap.get(d.id).join(', ')}`}
                    />
                  )}
                </button>
              ))}
            </div>
          ))}

          {docs.length > 0 && groupedDocs.length === 0 && (
            <p className="docs-empty-note">ไม่พบหน้าที่ตรงกับคำค้นหา</p>
          )}

          {!readOnly && docs.length > 0 && missingEntities.length > 0 && (
            <button type="button" className="secondary-button docs-bulk" onClick={createForAllEntities}>
              สร้างหน้าให้ Entity ที่ยังไม่มี ({missingEntities.length})
            </button>
          )}
        </aside>
      )}

      <article className="panel docs-main">
        {!activeDoc ? (
          <div className="empty-state big">
            <BookOpen size={34} />
            <p>ยังไม่มีเอกสารในโปรเจกต์นี้</p>
            {readOnly ? (
              <span>คุณมีสิทธิ์ดูอย่างเดียว จึงยังไม่สามารถสร้างเอกสารได้</span>
            ) : (
              <>
                <span>เพิ่มหน้าเปล่า หรือให้ระบบสร้างหน้าจาก Entity ที่มีอยู่แล้วก็ได้</span>
                <div className="docs-empty-actions">
                  {entities.length > 0 && (
                    <button type="button" className="primary-button" onClick={createForAllEntities}>
                      สร้างหน้าจาก Entity ทั้งหมด ({entities.length})
                    </button>
                  )}
                  <button
                    type="button"
                    className={entities.length > 0 ? 'secondary-button' : 'primary-button'}
                    onClick={openCreate}
                  >
                    <Plus size={16} /> เริ่มจากหน้าเปล่า
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="docs-header">
              <div className="docs-header-top">
                <span className="docs-crumb">{activeDoc.group || 'GENERAL'}</span>
                <div className="docs-actions">
                  {!readOnly && (
                    <>
                      <div className="docs-mode">
                        <button
                          type="button"
                          className={mode === 'preview' ? 'active' : ''}
                          onClick={() => setMode('preview')}
                        >
                          <Eye size={14} /> Preview
                        </button>
                        <button
                          type="button"
                          className={mode === 'edit' ? 'active' : ''}
                          onClick={() => setMode('edit')}
                        >
                          <Pencil size={14} /> Edit
                        </button>
                      </div>
                      <button type="button" className="icon-button" title="เลื่อนขึ้น" onClick={() => moveDoc(-1)}>
                        <ArrowUp size={16} />
                      </button>
                      <button type="button" className="icon-button" title="เลื่อนลง" onClick={() => moveDoc(1)}>
                        <ArrowDown size={16} />
                      </button>
                      <button type="button" className="secondary-button" onClick={() => openRename(activeDoc)}>
                        เปลี่ยนชื่อ / ย้ายกลุ่ม
                      </button>
                      {matchedEntity && (
                        <button type="button" className="secondary-button" onClick={syncFromEntity}>
                          ซิงก์จาก Entity
                        </button>
                      )}
                    </>
                  )}

                  <div className="notif-wrap">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setShowExport((open) => !open)}
                      aria-expanded={showExport}
                    >
                      <Download size={14} /> Export <ChevronDown size={14} />
                    </button>
                    {showExport && (
                      <>
                        <div className="workspace-backdrop" onClick={() => setShowExport(false)} />
                        <div className="workspace-dropdown docs-export-menu">
                          <div className="workspace-dropdown-title">หน้านี้</div>
                          <button type="button" className="workspace-action" onClick={() => runExport(exportMarkdown)}>
                            Markdown (.md)
                          </button>
                          <button
                            type="button"
                            className="workspace-action"
                            onClick={() => runExport(() => exportWord([activeDoc], projectName))}
                          >
                            Word (.doc)
                          </button>
                          <button
                            type="button"
                            className="workspace-action"
                            onClick={() => runExport(() => exportPdf([activeDoc], projectName))}
                          >
                            PDF
                          </button>

                          <div className="workspace-dropdown-divider" />

                          <div className="workspace-dropdown-title">ทุกหน้า ({docs.length})</div>
                          <button
                            type="button"
                            className="workspace-action"
                            onClick={() => runExport(() => exportWord(orderedDocs(), projectName))}
                          >
                            Word (.doc) รวมไฟล์เดียว
                          </button>
                          <button
                            type="button"
                            className="workspace-action"
                            onClick={() => runExport(() => exportPdf(orderedDocs(), projectName))}
                          >
                            PDF รวมไฟล์เดียว
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {!readOnly && (
                    <button type="button" className="icon-button docs-delete" title="ลบหน้านี้" onClick={handleDelete}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              <h1 className="docs-title">{activeDoc.title}</h1>
              {activeDoc.updatedAt && (
                <small className="docs-meta">
                  แก้ไขล่าสุด {new Date(activeDoc.updatedAt).toLocaleString('th-TH')}
                  {activeDoc.updatedBy ? ` · ${activeDoc.updatedBy}` : ''}
                </small>
              )}

              {activeStale && (
                <div className="docs-stale-banner">
                  <span>
                    หัวข้อ <strong>{activeStale.join(', ')}</strong> ในหน้านี้ไม่ตรงกับข้อมูล Entity ล่าสุด
                  </span>
                  {!readOnly && (
                    <button type="button" className="secondary-button" onClick={syncFromEntity}>
                      ซิงก์ตอนนี้
                    </button>
                  )}
                </div>
              )}
            </div>

            {activeMode === 'edit' ? (
              <div className="docs-editor">
                <div className="docs-toolbar">
                  {toolbar.map((item) => (
                    <button key={item.label} type="button" title={item.title} onClick={item.run}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="docs-split">
                  <textarea
                    ref={textareaRef}
                    className="docs-textarea"
                    spellCheck={false}
                    value={activeDoc.content}
                    placeholder="เขียนด้วย Markdown เช่น ## 1. Overview"
                    onFocus={() => {
                      focusContentRef.current = activeDoc.content
                    }}
                    onChange={(event) => updateContent(event.target.value)}
                    onBlur={() => {
                      if (focusContentRef.current !== activeDoc.content) {
                        onLog('update', 'doc', `${activeDoc.group} / ${activeDoc.title}`, `แก้ไขเนื้อหา ${activeDoc.title}`)
                      }
                    }}
                  />
                  <div className="md-body docs-live" dangerouslySetInnerHTML={{ __html: rendered.html }} />
                </div>
              </div>
            ) : (
              <div className="docs-read">
                {activeDoc.content.trim() ? (
                  <div className="md-body" dangerouslySetInnerHTML={{ __html: rendered.html }} />
                ) : (
                  <p className="docs-empty-note">
                    {readOnly ? 'หน้านี้ยังว่างอยู่' : 'หน้านี้ยังว่างอยู่ — กด Edit เพื่อเริ่มเขียน'}
                  </p>
                )}

                {toc.length > 0 && (
                  <nav className="docs-toc">
                    <div className="docs-toc-title">ON THIS PAGE</div>
                    {toc.map((h) => (
                      <button
                        type="button"
                        key={h.id}
                        className={`toc-level-${h.level}`}
                        onClick={() => scrollToHeading(h.id)}
                      >
                        {h.text}
                      </button>
                    ))}
                  </nav>
                )}
              </div>
            )}
          </>
        )}
      </article>

      {modal && (
        <div className="project-modal-overlay">
          <form className="project-modal" onSubmit={handleSaveModal}>
            <div className="project-modal-header">
              <div>
                <h2>{modal.type === 'rename' ? 'แก้ไขหน้าเอกสาร' : 'เพิ่มหน้าเอกสาร'}</h2>
                <p>ตั้งชื่อหน้าและเลือกกลุ่มที่จะแสดงใน Sidebar</p>
              </div>
              <button type="button" className="icon-button" onClick={closeModal} aria-label="ปิด">
                ×
              </button>
            </div>

            {modal.type === 'create' && (
              <>
                <label htmlFor="doc-template">เริ่มจาก</label>
                <select
                  id="doc-template"
                  value={template}
                  onChange={(event) => handleTemplateChange(event.target.value)}
                >
                  <option value="blank">หน้าเปล่า</option>
                  {entities.map((entity) => (
                    <option key={entity.name} value={entity.name}>
                      เทมเพลตจาก Entity: {entity.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label htmlFor="doc-title">ชื่อหน้า *</label>
            <input
              id="doc-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="เช่น Posts, Development Workflow"
              required
              autoFocus
            />

            <label htmlFor="doc-group">กลุ่ม</label>
            <input
              id="doc-group"
              list="doc-group-options"
              value={group}
              onChange={(event) => setGroup(event.target.value)}
              placeholder="เลือกหรือพิมพ์ชื่อกลุ่มใหม่"
            />
            <datalist id="doc-group-options">
              {allGroups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>

            <div className="project-modal-actions">
              <button type="button" className="secondary-button" onClick={closeModal}>
                ยกเลิก
              </button>
              <button type="submit" className="primary-button">
                {modal.type === 'rename' ? 'บันทึกการแก้ไข' : 'สร้างหน้า'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}