import { useMemo, useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import {
  Activity,
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  FolderKanban,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  Download,
  FileText,
  GitBranch,
  LayoutDashboard,
  Library,
  Link2,
  Plus,
  Search,
  Pencil,
  Trash2,
  Upload,
  X,
  ShieldCheck,
  Table2,
  Users,
  Terminal,
} from 'lucide-react'

import Query from './Query'
import './Query.css'
import './App.css'
import './Features.css'
import Documentation from './Documentation'
import Members, { ROLE_LABEL } from './Members'
import JoinInvite from './JoinInvite'
import { mergeProject } from './sync'
import { parseSqlSchema, applySqlImport } from './sqlImport'
import {
  buildSql,
  buildDictionaryCsv,
  buildImportTemplate,
  parseImportCsv,
  mergeImport,
  diagramToSvg,
  svgToPngBlob,
  downloadFile,
  safeFileName,
} from './exportImport'

const initialEntities = [
  {
    name: 'USERS',
    description: 'ข้อมูลผู้ใช้และบัญชีของระบบ',
    color: 'blue',
    icon: Users,
    fields: [
      { name: 'id', type: 'int', key: 'PK', description: 'รหัสผู้ใช้' },
      { name: 'username', type: 'varchar', key: '', description: 'ชื่อผู้ใช้' },
      { name: 'role', type: 'varchar', key: '', description: 'บทบาทผู้ใช้' },
      { name: 'created_at', type: 'datetime', key: '', description: 'วันที่สร้างบัญชี' },
    ],
  },
  {
    name: 'POSTS',
    description: 'ข้อมูลโพสต์และเนื้อหาที่ผู้ใช้สร้าง',
    color: 'green',
    icon: FileText,
    fields: [
      { name: 'id', type: 'int', key: 'PK', description: 'รหัสโพสต์' },
      { name: 'title', type: 'varchar', key: '', description: 'หัวข้อโพสต์' },
      { name: 'body', type: 'text', key: '', description: 'เนื้อหาโพสต์' },
      { name: 'user_id', type: 'int', key: 'FK', description: 'ผู้สร้างโพสต์' },
      { name: 'status', type: 'varchar', key: '', description: 'สถานะโพสต์' },
      { name: 'created_at', type: 'datetime', key: '', description: 'วันที่สร้างโพสต์' },
    ],
  },
  {
    name: 'FOLLOWS',
    description: 'ความสัมพันธ์การติดตามระหว่างผู้ใช้',
    color: 'purple',
    icon: GitBranch,
    fields: [
      { name: 'following_user_id', type: 'int', key: 'FK', description: 'ผู้ใช้ที่ติดตาม' },
      { name: 'followed_user_id', type: 'int', key: 'FK', description: 'ผู้ใช้ที่ถูกติดตาม' },
      { name: 'created_at', type: 'datetime', key: '', description: 'วันที่เริ่มติดตาม' },
    ],
  },
]

const initialRelationships = [
  {
    id: 1,
    fromEntity: 'USERS',
    fromField: 'id',
    toEntity: 'POSTS',
    toField: 'user_id',
    type: '1:N',
    label: 'creates',
    detail: 'ผู้ใช้หนึ่งคนสร้างโพสต์ได้หลายรายการ',
  },
  {
    id: 2,
    fromEntity: 'USERS',
    fromField: 'id',
    toEntity: 'FOLLOWS',
    toField: 'following_user_id',
    type: '1:N',
    label: 'following',
    detail: 'ผู้ใช้หนึ่งคนมีรายการติดตามได้หลายรายการ',
  },
  {
    id: 3,
    fromEntity: 'USERS',
    fromField: 'id',
    toEntity: 'FOLLOWS',
    toField: 'followed_user_id',
    type: '1:N',
    label: 'followed',
    detail: 'ผู้ใช้หนึ่งคนถูกติดตามได้หลายรายการ',
  },
]
const initialProjects = [
  {
    id: 1,
    name: 'Demo Project',
    description: 'ตัวอย่างระบบโซเชียล (USERS, POSTS, FOLLOWS)',
    entities: initialEntities,
    relationships: initialRelationships,
  },
]
// ===== Supabase serialization =====
const SEED_DEMO = false // true = ผู้ใช้ใหม่จะได้ Demo Project อัตโนมัติ

const ICONS = { Users, FileText, GitBranch, Database }
const iconKey = (icon) =>
  Object.keys(ICONS).find((key) => ICONS[key] === icon) ?? 'Database'

const serializeEntities = (entities) =>
  entities.map((entity) => ({ ...entity, icon: iconKey(entity.icon) }))

const deserializeEntities = (entities = []) =>
  entities.map((entity) => ({ ...entity, icon: ICONS[entity.icon] ?? Database }))

const fromRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  description: row.description ?? '',
  entities: deserializeEntities(row.entities),
  relationships: row.relationships ?? [],
  changelog: row.changelog ?? [],
  notes: row.notes ?? '',
  docs: row.docs ?? [],
})

// สถานะของโปรเจกต์ในรูปแบบที่บันทึกลงฐานข้อมูล (ใช้ทั้งบันทึกและเทียบ/รวมข้อมูล)
const snapshotOf = (project) => ({
  entities: serializeEntities(project.entities),
  relationships: project.relationships ?? [],
  changelog: project.changelog ?? [],
  notes: project.notes ?? '',
  docs: project.docs ?? [],
})

const rawSnapshot = (row) => ({
  entities: row.entities ?? [],
  relationships: row.relationships ?? [],
  changelog: row.changelog ?? [],
  notes: row.notes ?? '',
  docs: row.docs ?? [],
})

const fromSnapshot = (snap) => ({
  entities: deserializeEntities(snap.entities),
  relationships: snap.relationships,
  changelog: snap.changelog,
  notes: snap.notes,
  docs: snap.docs,
})

// ===== ER Diagram layout =====
const NODE_W = 260
const HEADER_H = 44
const ROW_H = 34
const GAP_X = 150
const GAP_Y = 60
const PAD = 30
const PAD_RIGHT = 90 // เว้นที่ให้เส้นโค้งฝั่งขวา
const MAX_COLS = 3

const COLOR_HEX = { blue: '#5689ed', green: '#20a98a', purple: '#8b69e8', orange: '#d99743' }
const COLOR_TINT = { blue: '#eaf1ff', green: '#e4f8f1', purple: '#f0eaff', orange: '#fff3e1' }
const ENTITY_COLORS = ['blue', 'green', 'purple', 'orange']

const makeImportEntity = (name, index) => ({
  name,
  description: '',
  color: ENTITY_COLORS[index % ENTITY_COLORS.length],
  icon: Database,
  fields: [],
})

// จำรหัสลิงก์เชิญไว้ก่อน เพราะหลังล็อกอิน Google หน้าเว็บจะรีโหลดและ ?join= หายไป
const readJoinCode = () => {
  try {
    const code = new URLSearchParams(window.location.search).get('join')
    if (code) {
      localStorage.setItem('ep_join', code)
      window.history.replaceState({}, '', window.location.pathname)
    }
    return localStorage.getItem('ep_join')
  } catch {
    return null
  }
}

function App() {
  //const [activePage, setActivePage] = useState('Projects')
  const readSaved = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? fallback : JSON.parse(raw)
    } catch {
      return fallback
    }
  }

  const [selectedProjectId, setSelectedProjectId] = useState(() => readSaved('ep_project', null))
  const [activePage, setActivePage] = useState(() =>
    readSaved('ep_project', null) !== null ? readSaved('ep_page', 'Overview') : 'Projects',
  )
  const [session, setSession] = useState(undefined)
  const [search, setSearch] = useState('')

  const [joinCode, setJoinCode] = useState(readJoinCode)
  const [pendingRequests, setPendingRequests] = useState([])
  const seenRequestsRef = useRef(new Set())
  const checkJoinRequestsRef = useRef(null)
  const closeJoin = () => {
    try { localStorage.removeItem('ep_join') } catch { /* ignore */ }
    setJoinCode(null)
  }

  // Relationship Management
  const [showRelationshipModal, setShowRelationshipModal] = useState(false)
  const [editingRelationship, setEditingRelationship] = useState(null)

  const [relationshipFromEntity, setRelationshipFromEntity] = useState('')
  const [relationshipFromField, setRelationshipFromField] = useState('')
  const [relationshipToEntity, setRelationshipToEntity] = useState('')
  const [relationshipToField, setRelationshipToField] = useState('')
  const [relationshipType, setRelationshipType] = useState('1:N')
  const [relationshipLabel, setRelationshipLabel] = useState('')
  const [relationshipDetail, setRelationshipDetail] = useState('')

  const [showEntityModal, setShowEntityModal] = useState(false)
  const [editingEntity, setEditingEntity] = useState(null)
  const [entityName, setEntityName] = useState('')
  const [entityDescription, setEntityDescription] = useState('')
  // Column Management
  const [showColumnModal, setShowColumnModal] = useState(false)
  const [editingColumn, setEditingColumn] = useState(null)
  const [columnName, setColumnName] = useState('')
  const [columnType, setColumnType] = useState('varchar')
  const [columnKey, setColumnKey] = useState('')
  const [columnNullable, setColumnNullable] = useState(true)
  const [columnDefault, setColumnDefault] = useState('')
  const [columnDescription, setColumnDescription] = useState('')
  // Column Search & Filter
  const [columnSearch, setColumnSearch] = useState('')
  const [columnTypeFilter, setColumnTypeFilter] = useState('all')
  // Data Dictionary sort
  const [dictSort, setDictSort] = useState(null) // null | { key, dir }
  // Import preview
  const [importPreview, setImportPreview] = useState(null)

  const [projects, setProjects] = useState([])
  const versionsRef = useRef({}) // { [projectId]: version ล่าสุดที่รู้จัก }
  const baseRef = useRef({}) // { [projectId]: snapshot ล่าสุดที่ตรงกับเซิร์ฟเวอร์ } ใช้รวมข้อมูลเมื่อแก้ชนกัน
  const projectsRef = useRef([])
  const saveQueueRef = useRef(Promise.resolve())
  const savingRef = useRef(false)
  const pendingRefreshRef = useRef(new Set())
  const [retryTick, setRetryTick] = useState(0)
  projectsRef.current = projects
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved | error | conflict
  const [saveError, setSaveError] = useState('')
  const dirtyRef = useRef(new Set())
  const loadedUserRef = useRef(null)
  const notesFocusRef = useRef('')
  //const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [selectedEntity, setSelectedEntity] = useState('')
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')

  // Members / Realtime / Notifications
  const [members, setMembers] = useState({}) // { [projectId]: [member rows] }
  const [membersReady, setMembersReady] = useState(false)
  const [realtimeStatus, setRealtimeStatus] = useState('')
  const [notifications, setNotifications] = useState([])
  const [toasts, setToasts] = useState([])
  const [showNotif, setShowNotif] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [toastEnabled, setToastEnabled] = useState(() => {
    try { return localStorage.getItem('ep_toast') !== 'off' } catch { return true }
  })
  const toastEnabledRef = useRef(toastEnabled)
  toastEnabledRef.current = toastEnabled

  // เก็บอีเมล/id ของเราไว้ใน ref เพราะ callback ของ Realtime ถูกสร้างครั้งเดียว (ถ้าอ้างตัวแปรตรงๆ จะได้ค่าเก่า)
  const myEmailRef = useRef('')
  const myIdRef = useRef('')

  const toggleToast = () => {
    const next = !toastEnabled
    setToastEnabled(next)
    try { localStorage.setItem('ep_toast', next ? 'on' : 'off') } catch { /* ignore */ }
  }

  const markAllRead = () =>
    setNotifications((current) => current.map((n) => ({ ...n, read: true })))

  const refreshProjectRef = useRef(null)
  const syncProjectListRef = useRef(null)
  const loadMembersRef = useRef(null)

  // โปรเจกต์ที่เปิดอยู่ และข้อมูลของโปรเจกต์นั้น
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null
  const entities = selectedProject?.entities ?? []
  const relationships = selectedProject?.relationships ?? []
  const user = session?.user
  const myEmail = (user?.email ?? '').toLowerCase()
  myEmailRef.current = myEmail
  myIdRef.current = user?.id ?? ''
  const displayName = user?.user_metadata?.full_name ?? user?.email ?? ''
  const avatarUrl = user?.user_metadata?.avatar_url
  const changelog = selectedProject?.changelog ?? []

  // บทบาทของผู้ใช้ในแต่ละโปรเจกต์
  const roleOf = (project) => {
    if (!project) return null
    const mine = (members[project.id] ?? []).find(
      (m) => (user?.id && m.user_id === user.id) || (m.email ?? '').toLowerCase() === myEmail,
    )
    if (mine) return mine.role
    if (project.userId && project.userId === user?.id) return 'admin'
    return membersReady ? 'viewer' : 'admin'
  }
  const myRole = roleOf(selectedProject)
  const canEdit = myRole === 'admin' || myRole === 'editor'
  const isAdmin = myRole === 'admin'
  const isOwner = Boolean(selectedProject?.userId) && selectedProject?.userId === user?.id

  const [showProjectMenu, setShowProjectMenu] = useState(false)
  const [editingProject, setEditingProject] = useState(null)

  const notify = (text, kind = 'info') => {
    const id = crypto.randomUUID()
    const item = { id, at: new Date().toISOString(), text, kind, read: false }
    setNotifications((current) => [item, ...current].slice(0, 30))
    if (!toastEnabledRef.current) return
    setToasts((current) => [...current, item])
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 6000)
  }

  const toggleNotif = () => {
    if (showNotif) setNotifications((current) => current.map((n) => ({ ...n, read: true })))
    setShowNotif((open) => !open)
  }

  const unreadCount = notifications.filter((n) => !n.read).length
  const pendingHere = selectedProject
    ? pendingRequests.filter((r) => r.project_id === selectedProject.id).length
    : 0

  const closeColumnModal = () => {
    setShowColumnModal(false)
    setEditingColumn(null)
    setColumnName('')
    setColumnType('varchar')
    setColumnKey('')
    setColumnNullable(true)
    setColumnDefault('')
    setColumnDescription('')
  }

  const updateProjectData = (key, updater) => {
    if (!canEdit || selectedProjectId === null) return
    dirtyRef.current.add(selectedProjectId)
    setProjects((current) =>
      current.map((project) =>
        project.id === selectedProjectId
          ? {
            ...project,
            [key]: typeof updater === 'function' ? updater(project[key]) : updater,
          }
          : project
      )
    )
  }

  const logChange = (action, target, name, summary) => {
    if (!canEdit || selectedProjectId === null) return
    dirtyRef.current.add(selectedProjectId)
    setProjects((current) =>
      current.map((p) =>
        p.id === selectedProjectId
          ? {
            ...p,
            changelog: [
              {
                id: crypto.randomUUID(),
                at: new Date().toISOString(),
                by: displayName,
                action,
                target,
                name,
                summary,
              },
              ...(p.changelog ?? []),
            ].slice(0, 500),
          }
          : p
      )
    )
  }

  const setEntities = (updater) => updateProjectData('entities', updater)
  const setRelationships = (updater) => updateProjectData('relationships', updater)
  const setNotes = (value) => updateProjectData('notes', value)
  const docs = selectedProject?.docs ?? []
  const setDocs = (updater) => updateProjectData('docs', updater)

  const allFields = useMemo(
    () => entities.flatMap((entity) =>
      entity.fields.map((field) => ({ ...field, entity: entity.name, color: entity.color })),
    ),
    [entities],
  )

  const filteredEntities = entities.filter((entity) =>
    `${entity.name} ${entity.description} ${entity.fields.map((f) => f.name).join(' ')}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )

  const filteredFields = allFields.filter((field) =>
    `${field.name} ${field.type} ${field.description} ${field.entity}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )

  // เรียงข้อมูลใน Data Dictionary (คลิกหัวคอลัมน์: ก-ฮ → ฮ-ก → ลำดับเดิม)
  const sortedFields = dictSort
    ? [...filteredFields].sort(
      (a, b) =>
        (dictSort.dir === 'asc' ? 1 : -1) *
        String(a[dictSort.key] ?? '').localeCompare(String(b[dictSort.key] ?? ''), undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
    )
    : filteredFields

  const toggleSort = (key) => {
    setDictSort((current) => {
      if (!current || current.key !== key) return { key, dir: 'asc' }
      if (current.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  const sortHeader = (label, key) => (
    <th>
      <button
        type="button"
        className={`th-sort ${dictSort?.key === key ? 'active' : ''}`}
        onClick={() => toggleSort(key)}
      >
        {label}
        {dictSort?.key === key && (dictSort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  )

  const activeEntity =
    entities.find((entity) => entity.name === selectedEntity) ??
    entities[0] ??
    {
      name: '',
      description: '',
      color: 'blue',
      icon: Database,
      fields: [],
    }

  const filteredActiveFields = (activeEntity?.fields ?? []).filter((field) => {
    const matchesSearch =
      `${field.name} ${field.description ?? ''}`
        .toLowerCase()
        .includes(columnSearch.toLowerCase())

    const matchesType =
      columnTypeFilter === 'all' ||
      field.type.toLowerCase() === columnTypeFilter.toLowerCase()

    return matchesSearch && matchesType
  })

  const projectNavItems = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'Entities', icon: Database },
    { label: 'Relationships', icon: Link2 },
    { label: 'ER Diagram', icon: GitBranch },
    { label: 'Data Dictionary', icon: BookOpen },
    { label: 'Query', icon: Terminal },
    { label: 'Documentation', icon: Library },
    { label: 'Import / Export', icon: Download },
    { label: 'Notes', icon: FileText },
    { label: 'Changelog', icon: Clock3 },
    { label: 'Members', icon: Users },
  ]

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })

    if (error) {
      console.error(error.message)
      alert('เข้าสู่ระบบไม่สำเร็จ: ' + error.message)
    }
  }

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      alert('ออกจากระบบไม่สำเร็จ: ' + error.message)
      return
    }
    try { localStorage.removeItem('ep_join') } catch { /* ignore */ }
    setJoinCode(null)
    setSelectedProjectId(null)
    setActivePage('Projects')
  }

  const openProjectModal = (project = null) => {
    setEditingProject(project)
    setProjectName(project?.name ?? '')
    setProjectDescription(project?.description ?? '')
    setShowProjectMenu(false)
    setShowProjectModal(true)
  }

  const closeProjectModal = () => {
    setShowProjectModal(false)
    setEditingProject(null)
    setProjectName('')
    setProjectDescription('')
  }

  const handleSaveProject = async (event) => {
    event.preventDefault()

    const name = projectName.trim()
    if (!name) return

    const duplicate = projects.some(
      (project) =>
        project.name.toLowerCase() === name.toLowerCase() &&
        project.id !== editingProject?.id
    )

    if (duplicate) {
      alert('มีโปรเจกต์ชื่อนี้อยู่แล้ว')
      return
    }

    const description = projectDescription.trim()

    // แก้ไขโปรเจกต์เดิม (เฉพาะ Admin)
    if (editingProject) {
      if (roleOf(editingProject) !== 'admin') {
        alert('เฉพาะ Admin เท่านั้นที่แก้ไขชื่อโปรเจกต์ได้')
        return
      }

      const { data, error } = await supabase
        .from('projects')
        .update({ name, description })
        .eq('id', editingProject.id)
        .select('version')
        .single()

      if (error) {
        alert('บันทึกไม่สำเร็จ: ' + error.message)
        return
      }

      // trigger ใน DB เพิ่ม version ทุกครั้งที่ update จึงต้องจำค่าใหม่ไว้
      versionsRef.current[editingProject.id] = data.version

      setProjects((current) =>
        current.map((project) =>
          project.id === editingProject.id
            ? { ...project, name, description }
            : project
        )
      )
      closeProjectModal()
      return
    }

    // สร้างโปรเจกต์ใหม่ แล้วเข้าไปที่หน้า Entities ทันที
    const { data, error } = await supabase
      .from('projects')
      .insert({ name, description, entities: [], relationships: [] })
      .select()
      .single()

    if (error) {
      alert('สร้างโปรเจกต์ไม่สำเร็จ: ' + error.message)
      return
    }

    versionsRef.current[data.id] = data.version
    baseRef.current[data.id] = rawSnapshot(data)

    const newProject = fromRow(data)
    setProjects((current) =>
      current.some((p) => p.id === newProject.id) ? current : [...current, newProject]
    )
    closeProjectModal()
    loadMembersRef.current?.()
    openProject(newProject)
    setActivePage('Entities')
  }

  const handleDeleteProject = async (project) => {
    const confirmed = window.confirm(
      `ต้องการลบโปรเจกต์ "${project.name}" และข้อมูลทั้งหมดในโปรเจกต์ใช่หรือไม่?`
    )
    if (!confirmed) return

    const { error } = await supabase.from('projects').delete().eq('id', project.id)

    if (error) {
      alert('ลบไม่สำเร็จ: ' + error.message)
      return
    }

    dirtyRef.current.delete(project.id)
    delete versionsRef.current[project.id]
    delete baseRef.current[project.id]
    setProjects((current) => current.filter((p) => p.id !== project.id))

    // ถ้ากำลังเปิดโปรเจกต์นี้อยู่ ให้กลับหน้า Projects
    if (selectedProjectId === project.id) {
      setSelectedProjectId(null)
      setActivePage('Projects')
    }
    setShowProjectMenu(false)
  }

  const handleSaveEntity = (event) => {
    event.preventDefault()
    if (!canEdit) return

    const name = entityName.trim()
    const description = entityDescription.trim()

    if (!name) return

    const duplicate = entities.some(
      (entity) =>
        entity.name.toLowerCase() === name.toLowerCase() &&
        entity.name !== editingEntity
    )

    if (duplicate) {
      alert('มี Entity ชื่อนี้อยู่แล้ว')
      return
    }

    if (editingEntity) {
      // เปลี่ยนชื่อ Entity
      setEntities((current) =>
        current.map((entity) =>
          entity.name === editingEntity
            ? { ...entity, name, description }
            : entity
        )
      )

      // เปลี่ยนชื่อ Entity ใน Relationships ด้วย
      setRelationships((current) =>
        current.map((rel) => ({
          ...rel,
          fromEntity:
            rel.fromEntity === editingEntity
              ? name
              : rel.fromEntity,
          toEntity:
            rel.toEntity === editingEntity
              ? name
              : rel.toEntity,
        }))
      )

      // เปลี่ยนชื่อหน้า Doc ที่จับคู่กับ Entity นี้ด้วย (ให้ปุ่ม "ซิงก์จาก Entity" ยังใช้ได้)
      setDocs((current) =>
        current.map((d) =>
          d.group === 'ENTITIES' && d.title.toLowerCase() === editingEntity.toLowerCase()
            ? { ...d, title: name, updatedAt: new Date().toISOString(), updatedBy: displayName }
            : d
        )
      )

      setSelectedEntity(name)
      logChange(
        'update',
        'entity',
        name,
        editingEntity === name
          ? `แก้ไข Entity ${name}`
          : `เปลี่ยนชื่อ Entity ${editingEntity} → ${name}`
      )
    } else {
      setEntities((current) => [
        ...current,
        {
          name,
          description,
          color: ENTITY_COLORS[entities.length % 4],
          icon: Database,
          fields: [],
        },
      ])

      setSelectedEntity(name)
      logChange('create', 'entity', name, `สร้าง Entity ${name}`)
    }

    setEntityName('')
    setEntityDescription('')
    setEditingEntity(null)
    setShowEntityModal(false)
  }

  const openProject = (project) => {
    setSelectedProjectId(project.id)
    setSelectedEntity(project.entities[0]?.name ?? '')
    setSearch('')
    setColumnSearch('')
    setColumnTypeFilter('all')
    setDictSort(null)
    setImportPreview(null)
    setActivePage('Overview')
  }

  const closeProject = () => {
    setSelectedProjectId(null)
    setActivePage('Projects')
  }

  const openEntityModal = (entity = null) => {
    setEditingEntity(entity?.name ?? null)
    setEntityName(entity?.name ?? '')
    setEntityDescription(entity?.description ?? '')
    setShowEntityModal(true)
  }

  const closeEntityModal = () => {
    setShowEntityModal(false)
    setEditingEntity(null)
    setEntityName('')
    setEntityDescription('')
  }

  const handleDeleteEntity = (name) => {
    if (!canEdit) return
    const confirmed = window.confirm(
      `ต้องการลบ Entity ${name} ใช่หรือไม่?`
    )

    if (!confirmed) return

    // ลบ Entity
    setEntities((current) =>
      current.filter((entity) => entity.name !== name)
    )

    // ลบ Relationship ที่เชื่อมกับ Entity นี้
    setRelationships((current) =>
      current.filter(
        (rel) =>
          rel.fromEntity !== name &&
          rel.toEntity !== name
      )
    )
    logChange('delete', 'entity', name, `ลบ Entity ${name}`)

    // ถ้า Entity ที่กำลังเลือกถูกลบ ให้เลือก Entity ตัวแรกที่เหลือ
    if (selectedEntity === name) {
      const remaining = entities.filter(
        (entity) => entity.name !== name
      )

      setSelectedEntity(remaining[0]?.name ?? '')
    }
  }

  // Open Column Modal
  const openColumnModal = (field = null) => {
    setEditingColumn(field)

    setColumnName(field?.name ?? '')
    setColumnType(field?.type ?? 'varchar')
    setColumnKey(field?.key ?? '')
    setColumnNullable(field?.nullable ?? true)
    setColumnDefault(field?.defaultValue ?? '')
    setColumnDescription(field?.description ?? '')

    setShowColumnModal(true)
  }

  // Save Column
  const handleSaveColumn = (event) => {
    event.preventDefault()

    if (!canEdit || !activeEntity) return

    const trimmedName = columnName.trim()

    if (!trimmedName) {
      alert('กรุณากรอกชื่อ Column')
      return
    }

    const isDuplicate = activeEntity.fields.some(
      (field) =>
        field.name.toLowerCase() === trimmedName.toLowerCase() &&
        field.name !== editingColumn?.name
    )

    if (isDuplicate) {
      alert('มี Column ชื่อนี้อยู่แล้ว')
      return
    }

    const newField = {
      name: trimmedName,
      type: columnType,
      key: columnKey,
      nullable: columnNullable,
      defaultValue: columnDefault.trim(),
      description: columnDescription.trim(),
    }

    setEntities((currentEntities) =>
      currentEntities.map((entity) => {
        if (entity.name !== activeEntity.name) return entity

        if (editingColumn) {
          return {
            ...entity,
            fields: entity.fields.map((field) =>
              field.name === editingColumn.name ? newField : field
            ),
          }
        }

        return {
          ...entity,
          fields: [...entity.fields, newField],
        }
      })
    )

    logChange(
      editingColumn ? 'update' : 'create',
      'column',
      `${activeEntity.name}.${trimmedName}`,
      editingColumn ? `แก้ไข Column ${trimmedName}` : `เพิ่ม Column ${trimmedName}`
    )

    // ถ้าเป็นการแก้ไข Column ให้เปลี่ยนชื่อใน Relationship ด้วย
    if (editingColumn && editingColumn.name !== trimmedName) {
      setRelationships((current) =>
        current.map((rel) => ({
          ...rel,

          fromField:
            rel.fromEntity === activeEntity.name &&
              rel.fromField === editingColumn.name
              ? trimmedName
              : rel.fromField,

          toField:
            rel.toEntity === activeEntity.name &&
              rel.toField === editingColumn.name
              ? trimmedName
              : rel.toField,
        }))
      )
    }

    closeColumnModal()
  }

  // Delete Column
  const handleDeleteColumn = (fieldName) => {
    if (!canEdit || !activeEntity) return

    const confirmed = window.confirm(
      `ต้องการลบ Column "${fieldName}" จาก ${activeEntity.name} ใช่หรือไม่?`
    )

    if (!confirmed) return

    const targetEntity = activeEntity.name

    // ลบ Column จาก Entity
    setEntities((currentEntities) =>
      currentEntities.map((entity) => {
        if (entity.name !== targetEntity) return entity

        return {
          ...entity,
          fields: entity.fields.filter(
            (field) => field.name !== fieldName
          ),
        }
      })
    )

    // ลบ Relationship ที่อ้างถึง Column นี้
    setRelationships((current) =>
      current.filter(
        (rel) =>
          !(
            (rel.fromEntity === targetEntity &&
              rel.fromField === fieldName) ||
            (rel.toEntity === targetEntity &&
              rel.toField === fieldName)
          )
      )
    )

    logChange('delete', 'column', `${targetEntity}.${fieldName}`, `ลบ Column ${fieldName}`)
  }

  // Open Relationship Modal
  const openRelationshipModal = (relationship = null) => {
    if (relationship) {
      setEditingRelationship(relationship)

      setRelationshipFromEntity(relationship.fromEntity)
      setRelationshipFromField(relationship.fromField)

      setRelationshipToEntity(relationship.toEntity)
      setRelationshipToField(relationship.toField)

      setRelationshipType(relationship.type)
      setRelationshipLabel(relationship.label)
      setRelationshipDetail(relationship.detail)
    } else {
      setEditingRelationship(null)

      setRelationshipFromEntity(entities[0]?.name || '')
      setRelationshipFromField(entities[0]?.fields[0]?.name || '')

      setRelationshipToEntity(entities[1]?.name || entities[0]?.name || '')
      setRelationshipToField(entities[1]?.fields[0]?.name || '')

      setRelationshipType('1:N')
      setRelationshipLabel('')
      setRelationshipDetail('')
    }

    setShowRelationshipModal(true)
  }

  // Save Relationship
  const handleSaveRelationship = (event) => {
    event.preventDefault()
    if (!canEdit) return

    if (
      !relationshipFromEntity ||
      !relationshipFromField ||
      !relationshipToEntity ||
      !relationshipToField
    ) {
      alert('กรุณาเลือก Entity และ Column ให้ครบ')
      return
    }

    if (
      relationshipFromEntity === relationshipToEntity &&
      relationshipFromField === relationshipToField
    ) {
      alert('ไม่สามารถเชื่อม Column เดียวกันเข้าหาตัวเองได้')
      return
    }

    const relationshipData = {
      id: editingRelationship
        ? editingRelationship.id
        : Date.now(),

      fromEntity: relationshipFromEntity,
      fromField: relationshipFromField,

      toEntity: relationshipToEntity,
      toField: relationshipToField,

      type: relationshipType,
      label: relationshipLabel.trim(),
      detail: relationshipDetail.trim(),
    }

    if (editingRelationship) {
      setRelationships((current) =>
        current.map((relationship) =>
          relationship.id === editingRelationship.id
            ? relationshipData
            : relationship
        )
      )
    } else {
      setRelationships((current) => [
        ...current,
        relationshipData,
      ])
    }
    logChange(
      editingRelationship ? 'update' : 'create',
      'relationship',
      `${relationshipFromEntity}.${relationshipFromField} → ${relationshipToEntity}.${relationshipToField}`,
      editingRelationship ? 'แก้ไข Relationship' : 'เพิ่ม Relationship'
    )
    setShowRelationshipModal(false)
    setEditingRelationship(null)
  }

  // Delete Relationship
  const handleDeleteRelationship = (id) => {
    if (!canEdit) return
    const confirmed = window.confirm('คุณต้องการลบ Relationship นี้ใช่หรือไม่?')
    if (!confirmed) return

    const rel = relationships.find((r) => r.id === id)

    setRelationships((current) =>
      current.filter((relationship) => relationship.id !== id)
    )

    logChange(
      'delete',
      'relationship',
      rel ? `${rel.fromEntity}.${rel.fromField} → ${rel.toEntity}.${rel.toField}` : String(id),
      'ลบ Relationship'
    )
  }

  // ===== Members =====
  const loadMembers = async () => {
    const { data, error } = await supabase
      .from('project_members')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('โหลดสมาชิกไม่สำเร็จ (ยังไม่ได้รัน members_realtime.sql?):', error.message)
      return
    }

    const map = {}
    data.forEach((m) => {
      if (!map[m.project_id]) map[m.project_id] = []
      map[m.project_id].push(m)
    })
    setMembers(map)
    setMembersReady(true)
  }
  loadMembersRef.current = loadMembers

  const inviteMember = async (rawEmail, role) => {
    if (!isAdmin || selectedProjectId === null) return false
    const email = rawEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('รูปแบบอีเมลไม่ถูกต้อง')
      return false
    }

    const { error } = await supabase
      .from('project_members')
      .insert({ project_id: selectedProjectId, email, role, invited_by: user.id })

    if (error) {
      alert(error.code === '23505' ? 'อีเมลนี้เป็นสมาชิกของโปรเจกต์อยู่แล้ว' : 'เชิญไม่สำเร็จ: ' + error.message)
      return false
    }

    await loadMembers()
    logChange('create', 'member', email, `เชิญ ${email} เป็น ${ROLE_LABEL[role]}`)
    notify(`เชิญ ${email} เป็น ${ROLE_LABEL[role]} แล้ว`, 'success')
    return true
  }

  const changeMemberRole = async (member, role) => {
    if (!isAdmin) return
    const { error } = await supabase.from('project_members').update({ role }).eq('id', member.id)
    if (error) {
      alert('เปลี่ยนบทบาทไม่สำเร็จ: ' + error.message)
      return
    }
    await loadMembers()
    logChange('update', 'member', member.email, `เปลี่ยนบทบาท ${member.email} เป็น ${ROLE_LABEL[role]}`)
  }

  const removeMember = async (member) => {
    const self = (member.email ?? '').toLowerCase() === myEmail
    const ok = window.confirm(
      self
        ? `ต้องการออกจากโปรเจกต์ "${selectedProject?.name}" ใช่หรือไม่?`
        : `ต้องการนำ ${member.email} ออกจากโปรเจกต์ใช่หรือไม่?`
    )
    if (!ok) return

    const { error } = await supabase.from('project_members').delete().eq('id', member.id)
    if (error) {
      alert('ดำเนินการไม่สำเร็จ: ' + error.message)
      return
    }

    if (self) {
      await syncProjectListRef.current?.()
      return
    }
    await loadMembers()
    logChange('delete', 'member', member.email, `นำ ${member.email} ออกจากโปรเจกต์`)
  }

  // ===== Realtime / merge =====
  const adoptRemote = (row) => {
    versionsRef.current[row.id] = row.version
    baseRef.current[row.id] = rawSnapshot(row)
    dirtyRef.current.delete(row.id)
    const next = fromRow(row)
    setProjects((current) =>
      current.some((p) => p.id === row.id)
        ? current.map((p) => (p.id === row.id ? next : p))
        : [...current, next]
    )
  }

  // ดึงโปรเจกต์ล่าสุดจากเซิร์ฟเวอร์เมื่อมีคนอื่นแก้ (ถ้าเรากำลังแก้อยู่ จะรอไปรวมตอน autosave)
  const refreshProject = async (id) => {
    if (dirtyRef.current.has(id) || savingRef.current) {
      pendingRefreshRef.current.add(id)
      return
    }

    const { data: row, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle()
    if (error || !row) return

    if (dirtyRef.current.has(id) || savingRef.current) {
      pendingRefreshRef.current.add(id)
      return
    }

    const known = projectsRef.current.find((p) => p.id === id)
    if (known && row.version === versionsRef.current[id]) return

    const topLog = (row.changelog ?? [])[0]
    const isNewLog = topLog && topLog.id !== known?.changelog?.[0]?.id

    adoptRemote(row)

    if (!known) {
      if (row.user_id !== user?.id) notify(`คุณถูกเชิญเข้าร่วมโปรเจกต์ "${row.name}"`, 'success')
      loadMembers()
    } else if (isNewLog) {
      notify(`[${row.name}] ${topLog.by || 'ผู้ใช้อื่น'}: ${topLog.summary}`)
    } else {
      notify(`โปรเจกต์ "${row.name}" ถูกอัปเดตโดยผู้ใช้อื่น`)
    }
  }
  refreshProjectRef.current = refreshProject

  // ซิงก์รายการโปรเจกต์ (เมื่อสมาชิกถูกเพิ่ม/ลบ/เปลี่ยนบทบาท)
  const syncProjectList = async () => {
    const { data: rows, error } = await supabase.from('projects').select('id')
    if (error) return

    const serverIds = new Set(rows.map((r) => r.id))
    const removed = projectsRef.current.filter((p) => !serverIds.has(p.id))

    if (removed.length) {
      removed.forEach((p) => {
        dirtyRef.current.delete(p.id)
        delete versionsRef.current[p.id]
        delete baseRef.current[p.id]
      })
      setProjects((current) => current.filter((p) => serverIds.has(p.id)))
      setSelectedProjectId((current) => (removed.some((p) => p.id === current) ? null : current))
      notify(`คุณไม่มีสิทธิ์เข้าถึงโปรเจกต์ ${removed.map((p) => `"${p.name}"`).join(', ')} แล้ว`, 'warn')
    }

    for (const r of rows) {
      if (!projectsRef.current.some((p) => p.id === r.id)) await refreshProject(r.id)
    }

    await loadMembers()
  }
  syncProjectListRef.current = syncProjectList
  // ตรวจคำขอเข้าร่วมที่รออนุมัติ (เฉพาะโปรเจกต์ที่เราเป็น Admin ตาม RLS)
  const checkJoinRequests = async () => {
    const myId = myIdRef.current
    if (!myId) return
    const { data, error } = await supabase
      .from('project_join_requests')
      .select('id, user_id, email, project_id, projects(name)')
      .eq('status', 'pending')
    if (error) return

    const others = data.filter((r) => r.user_id !== myId)
    setPendingRequests(others)

    others.forEach((r) => {
      if (seenRequestsRef.current.has(r.id)) return
      seenRequestsRef.current.add(r.id)
      notify(`${r.email} ขอเข้าร่วมโปรเจกต์ "${r.projects?.name ?? ''}"`, 'warn')
    })
  }
  checkJoinRequestsRef.current = checkJoinRequests

  useEffect(() => {
    if (!session?.user?.id) {
      setPendingRequests([])
      return
    }
    seenRequestsRef.current = new Set()
    const run = () => checkJoinRequestsRef.current?.()
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    run()
    const timer = setInterval(run, 15000)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [session?.user?.id])

  useEffect(() => {
    try {
      if (selectedProjectId === null) {
        localStorage.removeItem('ep_project')
        localStorage.removeItem('ep_page')
      } else {
        localStorage.setItem('ep_project', JSON.stringify(selectedProjectId))
        localStorage.setItem('ep_page', JSON.stringify(activePage))
      }
    } catch { /* ignore */ }
  }, [selectedProjectId, activePage])

  // 1) จัดการ session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        try { localStorage.removeItem('ep_join') } catch { /* ignore */ }
        setJoinCode(null)
      }
      setSession(nextSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  // 2) โหลดโปรเจกต์ของผู้ใช้เมื่อ login
  useEffect(() => {
    if (session === undefined) return
    const userId = session?.user?.id

    if (!userId) {
      loadedUserRef.current = null
      dirtyRef.current.clear()
      versionsRef.current = {}
      baseRef.current = {}
      setProjects([])
      setMembers({})
      setMembersReady(false)
      setNotifications([])
      setSelectedProjectId(null)
      setActivePage('Projects')
      return
    }
    if (loadedUserRef.current === userId) return
    loadedUserRef.current = userId

    const load = async () => {
      setLoadingProjects(true)

      // ผูกคำเชิญที่ส่งมาทางอีเมลเข้ากับบัญชีนี้ (ไม่มีฟังก์ชัน = ข้ามไป)
      await supabase.rpc('claim_project_invites')

      let { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: true })

      if (error) {
        loadedUserRef.current = null
        setLoadingProjects(false)
        alert('โหลดโปรเจกต์ไม่สำเร็จ: ' + error.message)
        return
      }

      // ผู้ใช้ใหม่ → สร้าง Demo Project ให้
      if (SEED_DEMO && data.length === 0) {
        const demo = initialProjects[0]
        const { data: created, error: seedError } = await supabase
          .from('projects')
          .insert({
            name: demo.name,
            description: demo.description,
            entities: serializeEntities(demo.entities),
            relationships: demo.relationships,
          })
          .select()
          .single()

        if (!seedError) data = [created]
      }

      data.forEach((row) => {
        versionsRef.current[row.id] = row.version
        baseRef.current[row.id] = rawSnapshot(row)
      })

      setProjects(data.map(fromRow))
      setSelectedProjectId((current) => {
        if (current !== null && !data.some((row) => row.id === current)) {
          setActivePage('Projects')
          return null
        }
        return current
      })
      setLoadingProjects(false)
      loadMembers()
    }

    load()
  }, [session?.user?.id])

  // 3) Realtime: รับการเปลี่ยนแปลงจากผู้ใช้อื่น
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return

    const channel = supabase
      .channel('entity-portal-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects' }, (payload) => {
        const id = payload.new?.id
        if (id === undefined || id === null) return
        if (payload.new.version !== undefined && payload.new.version === versionsRef.current[id]) return // เราบันทึกเอง
        refreshProjectRef.current?.(id)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'projects' }, (payload) => {
        const id = payload.old?.id
        const gone = projectsRef.current.find((p) => p.id === id)
        if (!gone) return
        dirtyRef.current.delete(id)
        delete versionsRef.current[id]
        delete baseRef.current[id]
        setProjects((current) => current.filter((p) => p.id !== id))
        setSelectedProjectId((current) => (current === id ? null : current))
        notify(`โปรเจกต์ "${gone.name}" ถูกลบโดยเจ้าของ`, 'warn')
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, (payload) => {
        // แจ้งเตือนเมื่อมีสมาชิกใหม่เข้าโปรเจกต์ที่เรามีอยู่แล้ว
        if (payload.eventType === 'INSERT') {
          const m = payload.new ?? {}
          const isMe = (m.email ?? '').toLowerCase() === myEmailRef.current
          const invitedByMe = Boolean(m.invited_by) && m.invited_by === myIdRef.current
          const project = projectsRef.current.find((p) => p.id === m.project_id)

          // ข้ามกรณีเป็นตัวเรา (มีแจ้ง "ถูกเชิญเข้าร่วม" ใน refreshProject อยู่แล้ว)
          // และกรณีเราเป็นคนเชิญเอง (inviteMember แจ้งไปแล้ว)
          if (project && !isMe && !invitedByMe) {
            notify(
              `${m.email} เข้าร่วมโปรเจกต์ "${project.name}" ในฐานะ ${ROLE_LABEL[m.role] ?? m.role}`,
              'success',
            )
          }
        }
        syncProjectListRef.current?.()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_join_requests' }, () => {
        checkJoinRequestsRef.current?.()
      })
      .subscribe((status) => setRealtimeStatus(status))

    return () => {
      supabase.removeChannel(channel)
      setRealtimeStatus('')
    }
  }, [session?.user?.id])

  // 4) Autosave: รอ 700ms หลังแก้ไขล่าสุด, บันทึกทีละรอบ, ตรวจ version, รวมข้อมูลอัตโนมัติเมื่อแก้ชนกัน, retry เมื่อพลาด
  useEffect(() => {
    if (dirtyRef.current.size === 0) return

    setSaveStatus('saving')

    // version ไม่ตรง = มีคนแก้ไปก่อน → ดึงของใหม่มารวมกับของเรา (3-way merge) แล้วบันทึกอีกครั้ง
    const mergeWithRemote = async (id, sent) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: row, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle()
        if (error) return 'error'
        if (!row) return 'conflict'

        const remote = rawSnapshot(row)
        const merged = mergeProject(baseRef.current[id] ?? remote, sent, remote)
        if (!merged) return 'conflict' // แก้จุดเดียวกันต่างกัน รวมเองไม่ได้

        const { data, error: upError } = await supabase
          .from('projects')
          .update(merged)
          .eq('id', id)
          .eq('version', row.version)
          .select('version')

        if (upError) return 'error'

        if (data && data.length > 0) {
          versionsRef.current[id] = data[0].version
          baseRef.current[id] = merged
          setProjects((current) =>
            current.map((p) => {
              if (p.id !== id) return p
              // เผื่อผู้ใช้พิมพ์เพิ่มระหว่างบันทึก: รวมสิ่งที่พิมพ์เพิ่มเข้ากับผลที่รวมแล้ว
              const now = snapshotOf(p)
              const next = mergeProject(sent, now, merged) ?? merged
              return { ...p, name: row.name, description: row.description ?? '', ...fromSnapshot(next) }
            })
          )
          return 'merged'
        }
      }
      return 'conflict'
    }

    const flushDirty = async () => {
      const ids = [...dirtyRef.current]
      if (ids.length === 0) return
      dirtyRef.current.clear()
      savingRef.current = true

      let failed = false
      let merged = false
      const conflicts = []

      try {
        for (const id of ids) {
          const project = projectsRef.current.find((p) => p.id === id)
          if (!project) continue

          const snap = snapshotOf(project)
          const { data, error } = await supabase
            .from('projects')
            .update(snap)
            .eq('id', id)
            .eq('version', versionsRef.current[id])
            .select('version')

          if (error) {
            failed = true
            dirtyRef.current.add(id)
            console.error('autosave failed:', error)
            setSaveError(error.message)
          } else if (data && data.length > 0) {
            versionsRef.current[id] = data[0].version
            baseRef.current[id] = snap
          } else {
            const result = await mergeWithRemote(id, snap)
            if (result === 'merged') merged = true
            else if (result === 'conflict') conflicts.push(project)
            else {
              failed = true
              dirtyRef.current.add(id)
            }
          }
        }

        // รวมอัตโนมัติไม่ได้ (หรือไม่มีสิทธิ์แก้ไข) → โหลดข้อมูลล่าสุดมาแทน
        for (const project of conflicts) {
          const { data: row } = await supabase.from('projects').select('*').eq('id', project.id).maybeSingle()
          if (row) adoptRemote(row)
        }
      } finally {
        savingRef.current = false
      }

      if (merged) notify('มีผู้ใช้อื่นแก้ไขพร้อมกัน ระบบรวมการแก้ไขให้อัตโนมัติแล้ว')

      if (conflicts.length) {
        setSaveStatus('conflict')
        alert(
          `โปรเจกต์ ${conflicts.map((p) => `"${p.name}"`).join(', ')} ถูกแก้ไขจากที่อื่นในจุดเดียวกัน ` +
          'หรือคุณไม่มีสิทธิ์แก้ไข ระบบโหลดข้อมูลล่าสุดมาแสดงแล้ว\n(การแก้ไขของคุณที่ชนกันจะไม่ถูกบันทึก)'
        )
      } else if (failed) {
        setSaveStatus('error')
        setTimeout(() => setRetryTick((t) => t + 1), 5000) // ลองใหม่ใน 5 วินาที
      } else if (dirtyRef.current.size === 0) {
        setSaveStatus('saved')
        setSaveError('')
      }

      // การเปลี่ยนแปลงจากคนอื่นที่เข้ามาระหว่างบันทึก
      const pending = [...pendingRefreshRef.current]
      pendingRefreshRef.current.clear()
      pending.forEach((id) => refreshProjectRef.current?.(id))
    }

    const timer = setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current.then(flushDirty).catch((error) => {
        console.error('autosave error', error)
        savingRef.current = false
        setSaveStatus('error')
      })
    }, 700)

    return () => clearTimeout(timer)
  }, [projects, retryTick])

  // 5) เตือนก่อนปิดแท็บถ้ายังบันทึกไม่เสร็จ
  useEffect(() => {
    const handler = (event) => {
      if (saveStatus === 'saving' || saveStatus === 'error') {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [saveStatus])

  const diagram = useMemo(() => {
    const cols = Math.min(MAX_COLS, Math.max(entities.length, 1))
    const nodeH = (e) => HEADER_H + Math.max(e.fields.length, 1) * ROW_H
    const rowCount = Math.ceil(entities.length / cols)

    const rowHeights = Array.from({ length: rowCount }, (_, r) =>
      Math.max(...entities.slice(r * cols, r * cols + cols).map(nodeH)),
    )

    let y = PAD
    const rowY = rowHeights.map((h) => {
      const top = y
      y += h + GAP_Y
      return top
    })

    const nodes = {}
    entities.forEach((entity, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      nodes[entity.name] = {
        entity,
        col,
        x: PAD + col * (NODE_W + GAP_X),
        y: rowY[row],
      }
    })

    const width = PAD + cols * NODE_W + (cols - 1) * GAP_X + PAD_RIGHT
    const height = Math.max(rowCount ? y - GAP_Y + PAD : 0, 200)

    const edges = relationships
      .map((rel) => {
        const a = nodes[rel.fromEntity]
        const b = nodes[rel.toEntity]
        if (!a || !b) return null

        const ai = a.entity.fields.findIndex((f) => f.name === rel.fromField)
        const bi = b.entity.fields.findIndex((f) => f.name === rel.toField)
        if (ai < 0 || bi < 0) return null

        const ay = a.y + HEADER_H + ai * ROW_H + ROW_H / 2
        const by = b.y + HEADER_H + bi * ROW_H + ROW_H / 2

        let ax, bx, c1x, c2x
        if (a.col === b.col) {
          // อยู่คอลัมน์เดียวกัน (หรือเชื่อมตัวเอง): ออกฝั่งขวาแล้ววนกลับ
          ax = a.x + NODE_W
          bx = b.x + NODE_W
          c1x = ax + 70
          c2x = bx + 70
        } else if (a.col < b.col) {
          ax = a.x + NODE_W
          bx = b.x
          c1x = ax + 60
          c2x = bx - 60
        } else {
          ax = a.x
          bx = b.x + NODE_W
          c1x = ax - 60
          c2x = bx + 60
        }

        const [fromCard = '1', toCard = 'N'] = (rel.type || '1:N').split(':')

        return {
          id: rel.id,
          label: rel.label,
          color: COLOR_HEX[b.entity.color] ?? '#8b69e8',
          d: `M ${ax} ${ay} C ${c1x} ${ay}, ${c2x} ${by}, ${bx} ${by}`,
          mx: (ax + 3 * c1x + 3 * c2x + bx) / 8,
          my: (ay + by) / 2,
          ax, ay, bx, by,
          fromCard, toCard,
          dirA: c1x >= ax ? 1 : -1,
          dirB: c2x >= bx ? 1 : -1,
        }
      })
      .filter(Boolean)

    return { nodes: Object.values(nodes), edges, width, height }
  }, [entities, relationships])

  // ===== Export / Import =====
  const baseName = safeFileName(selectedProject?.name ?? 'project')
  const diagramLayout = { NODE_W, HEADER_H, ROW_H, COLOR_HEX, COLOR_TINT }
  // ไม่ส่งป้ายชื่อความสัมพันธ์ไปในไฟล์ภาพ ให้ตรงกับที่แสดงบนหน้า ER Diagram
  const exportableDiagram = { ...diagram, edges: diagram.edges.map((edge) => ({ ...edge, label: '' })) }

  const exportSql = (dialect) =>
    downloadFile(
      `${baseName}_${dialect}.sql`,
      buildSql(entities, relationships, dialect, selectedProject?.name ?? ''),
      'text/sql;charset=utf-8',
    )

  const exportDictionary = () =>
    downloadFile(
      `${baseName}_data_dictionary.csv`,
      buildDictionaryCsv(entities, relationships),
      'text/csv;charset=utf-8',
    )

  const exportDiagramSvg = () =>
    downloadFile(
      `${baseName}_er_diagram.svg`,
      diagramToSvg(exportableDiagram, diagramLayout),
      'image/svg+xml;charset=utf-8',
    )

  const exportDiagramPng = async () => {
    try {
      const svg = diagramToSvg(exportableDiagram, diagramLayout)
      const blob = await svgToPngBlob(svg, Math.ceil(diagram.width), Math.ceil(diagram.height), 2)
      downloadFile(`${baseName}_er_diagram.png`, blob)
    } catch (error) {
      alert('ส่งออก PNG ไม่สำเร็จ: ' + error.message)
    }
  }
  const handleImportFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const isSql = /\.sql$/i.test(file.name)
    const maxMb = isSql ? 25 : 5

    if (file.size > maxMb * 1024 * 1024) {
      setImportPreview({ fileName: file.name, rows: [], warnings: [], error: `ไฟล์ใหญ่เกิน ${maxMb} MB` })
      return
    }
    if (!/\.(csv|tsv|txt|sql)$/i.test(file.name)) {
      setImportPreview({
        fileName: file.name,
        rows: [],
        warnings: [],
        error: 'รองรับเฉพาะไฟล์ .csv หรือ .sql (ถ้าเป็น Excel ให้บันทึกเป็น CSV UTF-8 ก่อน)',
      })
      return
    }

    try {
      const text = await file.text()
      setImportPreview(
        isSql
          ? { fileName: file.name, kind: 'sql', ...parseSqlSchema(text) }
          : { fileName: file.name, ...parseImportCsv(text) },
      )
    } catch (error) {
      setImportPreview({ fileName: file.name, rows: [], warnings: [], error: 'อ่านไฟล์ไม่สำเร็จ: ' + error.message })
    }
  }

  const importResult = useMemo(() => {
    if (!importPreview?.rows?.length) return null
    return importPreview.kind === 'sql'
      ? applySqlImport(entities, relationships, importPreview, makeImportEntity)
      : mergeImport(entities, importPreview.rows, makeImportEntity)
  }, [importPreview, entities, relationships])

  const confirmImport = () => {
    if (!canEdit || !importPreview?.rows?.length) return

    if (importPreview.kind === 'sql') {
      const result = applySqlImport(entities, relationships, importPreview, makeImportEntity)
      setEntities(result.entities)
      if (result.addedRelationships) setRelationships(result.relationships)
      logChange(
        'create',
        'import',
        importPreview.fileName,
        `นำเข้า SQL: เพิ่ม ${result.addedEntities} Entity, ${result.addedFields} Column, ${result.addedRelationships} Relationship (ข้าม ${result.skippedFields} Column ที่ซ้ำ)`,
      )
      notify(
        `นำเข้าสำเร็จ: เพิ่ม ${result.addedEntities} Entity, ${result.addedFields} Column, ${result.addedRelationships} Relationship`,
        'success',
      )
      setImportPreview(null)
      return
    }

    const result = mergeImport(entities, importPreview.rows, makeImportEntity)
    setEntities(result.entities)
    logChange(
      'create',
      'import',
      importPreview.fileName,
      `นำเข้า CSV: เพิ่ม ${result.addedEntities} Entity, ${result.addedFields} Column (ข้าม ${result.skippedFields} ที่ซ้ำ)`,
    )
    notify(
      `นำเข้าสำเร็จ: เพิ่ม ${result.addedEntities} Entity, ${result.addedFields} Column`,
      'success',
    )
    setImportPreview(null)
  }

  if (session === undefined) {
    return (
      <div className="login-loading">
        <div className="login-loading-logo">
          <Database size={28} />
        </div>
        <p>กำลังเตรียมพื้นที่ทำงาน...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="login-page">
        <div className="login-glow login-glow-one" />
        <div className="login-glow login-glow-two" />

        <div className="login-layout">
          <section className="login-intro">
            <div className="login-brand">
              <div className="login-brand-icon"><Database size={25} /></div>
              <div>
                <strong>Entity Portal</strong>
                <span>Database Documentation</span>
              </div>
            </div>

            <div className="login-intro-copy">
              <span className="login-eyebrow">YOUR TEAM'S DATA HUB</span>
              <h1>
                จัดการเอกสาร
                <br />
                ฐานข้อมูลของทีม
                <br />
                <span>ได้อย่างง่ายดาย</span>
              </h1>
              <p className="login-description">
                รวมโครงสร้างฐานข้อมูล ความสัมพันธ์ และรายละเอียดของแต่ละ
                Entity ไว้ในพื้นที่เดียว เพื่อให้ทีมทำงานร่วมกันได้ง่ายขึ้น
              </p>

              <div className="login-feature">
                <div className="login-feature-icon blue"><Database size={21} /></div>
                <div>
                  <strong>โครงสร้างฐานข้อมูล</strong>
                  <p>ดูตารางและรายละเอียดของแต่ละ Field</p>
                </div>
              </div>

              <div className="login-feature">
                <div className="login-feature-icon purple"><Link2 size={21} /></div>
                <div>
                  <strong>เห็นความสัมพันธ์ของข้อมูล</strong>
                  <p>สำรวจ Entity และ ER Diagram ได้ในที่เดียว</p>
                </div>
              </div>

              <div className="login-feature">
                <div className="login-feature-icon cyan"><BookOpen size={21} /></div>
                <div>
                  <strong>เอกสารครบถ้วน</strong>
                  <p>ช่วยให้ทีมเข้าใจข้อมูลตรงกัน</p>
                </div>
              </div>
            </div>

            <div className="login-tagline">
              BETTER DATA <span>/</span> BETTER TEAMS <span>/</span> BETTER WORK
            </div>
          </section>

          <section className="login-card">
            <div className="login-card-logo"><Database size={31} /></div>
            <h2>ยินดีต้อนรับ</h2>
            <p className="login-card-subtitle">Welcome to Entity Portal</p>
            <p className="login-card-description">
              เข้าสู่ระบบด้วยบัญชี Google ของคุณ
              <br />
              เพื่อเข้าถึงเอกสารฐานข้อมูลของทีม
            </p>
            {joinCode && (
              <p className="login-invite-note">คุณได้รับคำเชิญเข้าร่วมโปรเจกต์ กรุณาเข้าสู่ระบบก่อน</p>
            )}

            <button className="login-google-button" onClick={handleGoogleLogin}>
              <span className="google-g">G</span>
              <span>Continue with Google</span>
            </button>

            <div className="login-divider">
              <span />
              <small>ปลอดภัยและใช้งานง่าย</small>
              <span />
            </div>

            <div className="login-security">
              <div className="login-security-icon"><ShieldCheck size={21} /></div>
              <div>
                <strong>พื้นที่ทำงานสำหรับทีม</strong>
                <p>
                  ใช้บัญชีที่ได้รับอนุญาตเพื่อเข้าถึงระบบ
                  โปรดเก็บข้อมูลบัญชีของคุณให้ปลอดภัย
                </p>
              </div>
            </div>

            <div className="login-card-footer">
              <span className="login-lock">●</span>
              สำหรับสมาชิกที่ได้รับอนุญาตเท่านั้น
            </div>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Database size={23} /></div>
          <div>
            <div className="brand-title">Entity Portal</div>
            <div className="brand-subtitle">Database Documentation</div>
          </div>
        </div>

        {selectedProject && (
          <>
            <button type="button" className="sidebar-back" onClick={closeProject}>
              <ArrowLeft size={15} /> All Projects
            </button>

            <div className="workspace-label">CURRENT PROJECT</div>
            <div className="workspace-menu">
              <button
                type="button"
                className="workspace-switch"
                onClick={() => setShowProjectMenu((open) => !open)}
                aria-expanded={showProjectMenu}
              >
                <div className="workspace-avatar">
                  {selectedProject.name.charAt(0).toUpperCase()}
                </div>
                <div className="workspace-copy">
                  <strong>{selectedProject.name}</strong>
                  <span>
                    {entities.length} entities · {relationships.length} links · {ROLE_LABEL[myRole]}
                  </span>
                </div>
                <ChevronDown size={16} className={showProjectMenu ? 'chevron-open' : ''} />
              </button>

              {showProjectMenu && (
                <>
                  <div className="workspace-backdrop" onClick={() => setShowProjectMenu(false)} />
                  <div className="workspace-dropdown">
                    <div className="workspace-dropdown-title">สลับโปรเจกต์</div>

                    <div className="workspace-dropdown-list">
                      {projects.map((project) => (
                        <button
                          type="button"
                          key={project.id}
                          className={`workspace-option ${project.id === selectedProjectId ? 'active' : ''}`}
                          onClick={() => {
                            openProject(project)
                            setShowProjectMenu(false)
                          }}
                        >
                          <span className="workspace-option-avatar">
                            {project.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="workspace-option-copy">
                            <strong>{project.name}</strong>
                            <small>{project.entities.length} entities</small>
                          </span>
                          {project.id === selectedProjectId && <CheckCircle2 size={15} />}
                        </button>
                      ))}
                    </div>

                    <div className="workspace-dropdown-divider" />

                    {isAdmin && (
                      <button
                        type="button"
                        className="workspace-action"
                        onClick={() => openProjectModal(selectedProject)}
                      >
                        <Pencil size={15} /> แก้ไขโปรเจกต์นี้
                      </button>
                    )}
                    <button
                      type="button"
                      className="workspace-action"
                      onClick={() => openProjectModal()}
                    >
                      <Plus size={15} /> สร้างโปรเจกต์ใหม่
                    </button>
                    {isOwner && (
                      <button
                        type="button"
                        className="workspace-action workspace-action-danger"
                        onClick={() => {
                          setShowProjectMenu(false)
                          handleDeleteProject(selectedProject)
                        }}
                      >
                        <Trash2 size={15} /> ลบโปรเจกต์นี้
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="nav-label">PROJECT MENU</div>
            <nav className="navigation">
              {projectNavItems.map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  className={`nav-item ${activePage === label ? 'active' : ''}`}
                  onClick={() => setActivePage(label)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {label === 'Entities' && <span className="nav-count">{entities.length}</span>}
                  {label === 'Members' && (members[selectedProject.id]?.length ?? 0) > 0 && (
                    <span className="nav-count">{members[selectedProject.id].length}</span>
                  )}
                  {label === 'Members' && pendingHere > 0 && (
                    <span className="nav-pending">{pendingHere}</span>
                  )}
                </button>
              ))}
            </nav>
          </>
        )}
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">
            {selectedProject ? (
              <>
                <button type="button" className="crumb-link" onClick={closeProject}>Projects</button>
                <span className="crumb-separator">/</span>
                <span>{selectedProject.name}</span>
                <span className="crumb-separator">/</span>
                <strong>{activePage}</strong>
              </>
            ) : (
              <strong>Projects</strong>
            )}
          </div>
          <div className="topbar-actions">
            <span className={`status-pill save-${saveStatus}`} title={saveError}>
              <span className="status-dot" />
              {{
                idle: realtimeStatus === 'SUBSCRIBED' ? 'Live sync' : 'Cloud sync',
                saving: 'Saving…',
                saved: 'Saved',
                error: 'Save failed',
                conflict: 'Conflict',
              }[saveStatus]}
            </span>

            <div className="notif-wrap">
              <button
                className="icon-button"
                aria-label="Notifications"
                title="การแจ้งเตือน"
                onClick={toggleNotif}
              >
                <Bell size={18} />
              </button>
              {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}

              {showNotif && (
                <>
                  <div className="workspace-backdrop" onClick={toggleNotif} />
                  <div className="notif-dropdown">
                    <div className="notif-title">
                      <span>NOTIFICATIONS</span>
                      {notifications.length > 0 && (
                        <span>
                          <button type="button" onClick={markAllRead}>อ่านทั้งหมด</button>
                          {' · '}
                          <button type="button" onClick={() => setNotifications([])}>ล้างทั้งหมด</button>
                        </span>
                      )}
                    </div>
                    {notifications.length === 0 && <div className="notif-empty">ยังไม่มีการแจ้งเตือน</div>}
                    {notifications.map((n) => (
                      <div key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`}>
                        {n.text}
                        <small>{new Date(n.at).toLocaleString('th-TH')}</small>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="notif-wrap">
              <button
                type="button"
                className="avatar avatar-button"
                title={displayName}
                aria-label="Profile"
                onClick={() => setShowProfile((open) => !open)}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  displayName.charAt(0).toUpperCase() || 'U'
                )}
              </button>

              {showProfile && (
                <>
                  <div className="workspace-backdrop" onClick={() => setShowProfile(false)} />
                  <div className="notif-dropdown profile-dropdown">
                    <div className="profile-head">
                      <div className="profile-avatar">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
                        ) : (
                          displayName.charAt(0).toUpperCase() || 'U'
                        )}
                      </div>
                      <div className="profile-info">
                        <strong>{displayName}</strong>
                        <small>{user?.email}</small>
                      </div>
                    </div>

                    <div className="profile-row">
                      <span>โปรเจกต์ปัจจุบัน</span>
                      <strong>{selectedProject ? selectedProject.name : 'ยังไม่ได้เลือก'}</strong>
                    </div>

                    <div className="profile-row">
                      <span>สิทธิ์ของคุณ</span>
                      {selectedProject ? (
                        <span className={`role-badge role-${myRole}`}>
                          {ROLE_LABEL[myRole]}{isOwner ? ' · เจ้าของ' : ''}
                        </span>
                      ) : (
                        <strong>-</strong>
                      )}
                    </div>

                    <button
                      type="button"
                      className="settings-row settings-btn settings-danger"
                      onClick={() => { setShowProfile(false); handleLogout() }}
                    >
                      ออกจากระบบ
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <section className="page-content">
          {!selectedProject && (
            <>
              <div className="welcome-row">
                <div>
                  <div className="eyebrow"><span className="eyebrow-dot" /> PROJECTS</div>
                  <h1>My Projects</h1>
                  <p className="welcome-description">
                    เลือกโปรเจกต์เพื่อเข้าไปจัดการ Entity, Relationship และ ER Diagram
                  </p>
                </div>
              </div>

              {loadingProjects ? (
                <p className="empty-state">กำลังโหลดโปรเจกต์...</p>
              ) : (
                <div className="project-grid">
                  {projects.map((project) => {
                    const role = roleOf(project)
                    const owner = Boolean(project.userId) && project.userId === user?.id
                    return (
                      <div
                        className="project-card"
                        key={project.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openProject(project)}
                        onKeyDown={(event) => event.key === 'Enter' && openProject(project)}
                      >
                        <div className="project-card-icon"><FolderKanban size={26} /></div>
                        <strong>{project.name}</strong>
                        <p>{project.description || 'ไม่มีรายละเอียด'}</p>
                        <div className="project-card-meta">
                          <span>{project.entities.length} entities</span>
                          <span>{project.relationships.length} links</span>
                        </div>
                        <span className={`role-badge role-${role}`}>{ROLE_LABEL[role]}</span>

                        {(role === 'admin' || owner) && (
                          <div className="project-card-actions">
                            {role === 'admin' && (
                              <button
                                type="button"
                                className="project-card-edit"
                                title="แก้ไขโปรเจกต์"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openProjectModal(project)
                                }}
                              >
                                <Pencil size={15} />
                              </button>
                            )}
                            {owner && (
                              <button
                                type="button"
                                className="project-card-delete"
                                title="ลบโปรเจกต์"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleDeleteProject(project)
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <button
                    type="button"
                    className="project-card project-card-new"
                    onClick={() => openProjectModal()}
                  >
                    <Plus size={26} />
                    <strong>สร้างโปรเจกต์ใหม่</strong>
                  </button>
                </div>
              )}
            </>
          )}

          {selectedProject && (
            <>
              <div className="welcome-row">
                <div>
                  <h1>{activePage === 'Overview' ? selectedProject.name : activePage}</h1>
                  <p className="welcome-description">
                    {selectedProject.description || 'Explore your database structure, entities, and relationships.'}
                  </p>
                </div>
              </div>

              {!canEdit && (
                <div className="readonly-banner">
                  คุณมีสิทธิ์ <strong>Viewer</strong> ในโปรเจกต์นี้ — ดูและส่งออกข้อมูลได้ แต่แก้ไขไม่ได้
                </div>
              )}

              {activePage === 'Overview' && (
                <div className="stats-grid">
                  <StatCard icon={Database} label="Total Entities" value={entities.length} note="Database tables" color="blue" />
                  <StatCard icon={Table2} label="Total Fields" value={allFields.length} note="Across all entities" color="green" />
                  <StatCard icon={Link2} label="Relationships" value={relationships.length} note="Documented links" color="purple" />
                  <StatCard icon={Activity} label="Documentation" value="Draft" note="Ready for review" color="orange" />
                </div>
              )}
            </>
          )}

          {selectedProject && activePage === 'Overview' && (
            <div className="content-grid">
              <section className="panel entity-panel">
                <div className="panel-heading">
                  <div>
                    <h2><Database size={19} /> Entity Catalog</h2>
                    <p>Browse the main tables in your system</p>
                  </div>
                </div>
                <div className="entity-list">
                  {entities.map((entity) => (
                    <div key={entity.name} className="entity-row">
                      <div className={`entity-icon ${entity.color}`}><entity.icon size={19} /></div>
                      <div className="entity-row-copy">
                        <strong>{entity.name}</strong>
                        <span>{entity.description}</span>
                      </div>
                      <span className="field-count">{entity.fields.length} fields</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel quick-panel">
                <div className="panel-heading">
                  <div>
                    <h2><Clock3 size={19} /> Quick access</h2>
                    <p>Jump into documentation</p>
                  </div>
                </div>

                <div className="quick-link" onClick={() => setActivePage('ER Diagram')}>
                  <span className="quick-icon purple"><GitBranch size={18} /></span>
                  <span><strong>ER Diagram</strong><small>Explore table relationships</small></span>
                </div>
                <div className="quick-link" onClick={() => setActivePage('Data Dictionary')}>
                  <span className="quick-icon green"><BookOpen size={18} /></span>
                  <span><strong>Data Dictionary</strong><small>Browse every field</small></span>
                </div>
                <div className="quick-link" onClick={() => setActivePage('Relationships')}>
                  <span className="quick-icon blue"><Link2 size={18} /></span>
                  <span><strong>Relationships</strong><small>Understand data connections</small></span>
                </div>
              </section>
            </div>
          )}

          {selectedProject && activePage === 'Entities' && (
            entities.length === 0 ? (
              <section className="panel empty-panel">
                <div className="empty-state big">
                  <Database size={34} />
                  <p>No entities yet</p>
                  <span>
                    {canEdit
                      ? 'Create your first Entity to start documenting this database.'
                      : 'ยังไม่มี Entity ในโปรเจกต์นี้'}
                  </span>
                  {canEdit && (
                    <button className="primary-button" onClick={() => openEntityModal()}>
                      <Plus size={17} /> New Entity
                    </button>
                  )}
                </div>
              </section>
            ) : (
              <div className="content-grid entity-detail-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2><Database size={19} /> Entities</h2>
                      <p>Select a table to see its fields</p>
                    </div>
                    {canEdit && (
                      <button className="primary-button" onClick={() => openEntityModal()}>
                        <Plus size={17} /> New Entity
                      </button>
                    )}
                  </div>

                  <div className="search-box">
                    <Search size={17} />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entities or fields..." />
                  </div>
                  <div className="entity-list">
                    {filteredEntities.map((entity) => (
                      <button key={entity.name} className={`entity-row ${activeEntity.name === entity.name ? 'selected' : ''}`} onClick={() => setSelectedEntity(entity.name)}>
                        <div className={`entity-icon ${entity.color}`}><entity.icon size={19} /></div>
                        <div className="entity-row-copy"><strong>{entity.name}</strong><span>{entity.description}</span></div>
                        <span className="field-count">{entity.fields.length} fields</span>
                      </button>
                    ))}
                    {filteredEntities.length === 0 && <p className="empty-state">No matching entities found.</p>}
                  </div>
                </section>

                <section className="panel detail-panel">
                  <div className="detail-header">
                    <div className={`entity-icon large ${activeEntity.color}`}><activeEntity.icon size={22} /></div>
                    <div>
                      <div className="eyebrow">ENTITY DETAILS</div>
                      <h2>{activeEntity.name}</h2>
                      <p>{activeEntity.description}</p>
                    </div>
                  </div>

                  <div className="entity-notes">
                    <label htmlFor="entity-notes">NOTES</label>
                    <textarea
                      id="entity-notes"
                      rows={3}
                      readOnly={!canEdit}
                      placeholder="โน้ตเพิ่มเติมของ Entity นี้ เช่น ใช้งานตอนไหน, ข้อควรระวัง..."
                      value={activeEntity.notes ?? ''}
                      onChange={(event) =>
                        setEntities((current) =>
                          current.map((entity) =>
                            entity.name === activeEntity.name
                              ? { ...entity, notes: event.target.value }
                              : entity
                          )
                        )
                      }
                    />
                  </div>

                  <div className="entity-toolbar">
                    <div className="search-box column-search">
                      <Search size={17} />
                      <input
                        value={columnSearch}
                        onChange={(event) => setColumnSearch(event.target.value)}
                        placeholder="Search column name or description..."
                      />
                    </div>

                    <select
                      className="filter-select"
                      aria-label="Filter by type"
                      value={columnTypeFilter}
                      onChange={(event) => setColumnTypeFilter(event.target.value)}
                    >
                      <option value="all">All Types</option>
                      {[...new Set((activeEntity?.fields ?? []).map((field) => field.type))].map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>

                    {canEdit && (
                      <div className="toolbar-actions">
                        <button className="secondary-button" onClick={() => openEntityModal(activeEntity)}>
                          Edit Entity
                        </button>
                        <div className="toolbar-actions-right">
                          <button className="secondary-button danger-button" onClick={() => handleDeleteEntity(activeEntity.name)}>
                            Delete Entity
                          </button>
                          <button className="primary-button" onClick={() => openColumnModal()}>
                            <Plus size={17} /> Add Column
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="field-table-wrap">
                    <table className="field-table">
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>Type</th>
                          <th>Key</th>
                          <th>Null</th>
                          <th>Default</th>
                          <th>Description</th>
                          {canEdit && <th>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredActiveFields.map((field) => (
                          <tr key={field.name}>
                            <td className="field-name">{field.name}</td>
                            <td><span className="type-tag">{field.type}</span></td>
                            <td>
                              {field.key && (
                                <span className={`key-tag ${field.key.toLowerCase()}`}>{field.key}</span>
                              )}
                            </td>
                            <td>{field.nullable === false ? 'NOT NULL' : 'NULL'}</td>
                            <td>{field.defaultValue || '-'}</td>
                            <td>{field.description}</td>
                            {canEdit && (
                              <td>
                                <button className="secondary-button" onClick={() => openColumnModal(field)}>
                                  Edit
                                </button>
                                <button className="secondary-button" onClick={() => handleDeleteColumn(field.name)}>
                                  Delete
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="detail-footer">
                    <span>
                      <Table2 size={15} />{' '}
                      {filteredActiveFields.length === activeEntity.fields.length
                        ? `${activeEntity.fields.length} fields documented`
                        : `Showing ${filteredActiveFields.length} of ${activeEntity.fields.length} fields`}
                    </span>
                  </div>
                </section>
              </div>
            )
          )}

          {selectedProject && activePage === 'Data Dictionary' && (
            <section className="panel">
              <div className="panel-heading">
                <div><h2><BookOpen size={19} /> Data Dictionary</h2><p>Search fields across all documented entities · คลิกหัวคอลัมน์เพื่อเรียงข้อมูล</p></div>
                <div className="panel-heading-actions">
                  <span className="result-count">{sortedFields.length} fields</span>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={exportDictionary}
                    disabled={!allFields.length}
                  >
                    <Download size={14} /> Export CSV
                  </button>
                </div>
              </div>
              <div className="search-box dictionary-search">
                <Search size={17} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search field, type, entity, or description..." />
              </div>
              <div className="field-table-wrap">
                <table className="field-table">
                  <thead>
                    <tr>
                      {sortHeader('Field', 'name')}
                      {sortHeader('Entity', 'entity')}
                      {sortHeader('Type', 'type')}
                      {sortHeader('Key', 'key')}
                      {sortHeader('Description', 'description')}
                    </tr>
                  </thead>
                  <tbody>{sortedFields.map((field) => (
                    <tr key={`${field.entity}-${field.name}`}><td className="field-name">{field.name}</td><td><span className={`entity-badge ${field.color}`}>{field.entity}</span></td><td><span className="type-tag">{field.type}</span></td><td>{field.key && <span className={`key-tag ${field.key.toLowerCase()}`}>{field.key}</span>}</td><td>{field.description}</td></tr>
                  ))}</tbody>
                </table>
                {sortedFields.length === 0 && <p className="empty-state">No matching fields found.</p>}
              </div>
            </section>
          )}
          {selectedProject && activePage === 'Query' && (
            <Query
              entities={entities}
              relationships={relationships}
              onOpenEntity={(name) => {
                setSelectedEntity(name)
                setActivePage('Entities')
              }}
            />
          )}

          {selectedProject && activePage === 'Relationships' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    <Link2 size={19} /> Relationship Catalog
                  </h2>
                  <p>
                    Manage connections between database entities
                  </p>
                </div>

                {canEdit && (
                  <button
                    className="primary-button"
                    onClick={() => openRelationshipModal()}
                  >
                    <Plus size={16} />
                    Add Relationship
                  </button>
                )}
              </div>

              <div className="relationship-list">
                {relationships.map((rel) => (
                  <div
                    className="relationship-row"
                    key={rel.id}
                  >
                    <div className="relationship-content">
                      <div className="relationship-entities">
                        <span className="entity-badge blue">
                          {rel.fromEntity}
                        </span>

                        <div className="relationship-connection">
                          <ArrowRight size={18} />

                          <span>{rel.type}</span>
                        </div>

                        <span className="entity-badge purple">
                          {rel.toEntity}
                        </span>
                      </div>

                      <div className="relationship-fields">
                        <code>
                          {rel.fromEntity}.{rel.fromField}
                        </code>

                        <ArrowRight size={14} />

                        <code>
                          {rel.toEntity}.{rel.toField}
                        </code>
                      </div>

                      <strong className="relationship-label">
                        {rel.label || 'No label'}
                      </strong>

                      <p>{rel.detail || 'No description'}</p>
                    </div>

                    {canEdit && (
                      <div className="relationship-actions">
                        <button
                          type="button"
                          title="Edit Relationship"
                          onClick={() => openRelationshipModal(rel)}
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          title="Delete Relationship"
                          onClick={() =>
                            handleDeleteRelationship(rel.id)
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {relationships.length === 0 && (
                  <div className="empty-state">
                    <Link2 size={30} />
                    <p>No relationships yet</p>
                    {canEdit && (
                      <span>
                        Click Add Relationship to create your first connection.
                      </span>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {selectedProject && activePage === 'ER Diagram' && (
            <section className="panel diagram-panel">
              <div className="panel-heading">
                <div>
                  <h2><GitBranch size={19} /> Entity Relationship Diagram</h2>
                  <p>Diagram updates automatically from your entities and relationships</p>
                </div>
                <div className="panel-heading-actions">
                  <span className="result-count">
                    {entities.length} entities · {diagram.edges.length} links
                  </span>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={exportDiagramPng}
                    disabled={!entities.length}
                  >
                    <Download size={14} /> PNG
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={exportDiagramSvg}
                    disabled={!entities.length}
                  >
                    <Download size={14} /> SVG
                  </button>
                </div>
              </div>

              {entities.length === 0 ? (
                <div className="empty-state big">
                  <GitBranch size={30} />
                  <p>No entities to display</p>
                  <span>Create an entity first, then it will appear here.</span>
                </div>
              ) : (
                <div className="diagram-canvas">
                  <div className="er-board" style={{ width: diagram.width, height: diagram.height }}>
                    <svg className="er-lines" width={diagram.width} height={diagram.height}>
                      {diagram.edges.map((edge) => (
                        <g key={edge.id}>
                          <path d={edge.d} stroke={edge.color} strokeWidth="2" fill="none" />
                          <circle cx={edge.ax} cy={edge.ay} r="3.5" fill={edge.color} />
                          <circle cx={edge.bx} cy={edge.by} r="3.5" fill={edge.color} />

                          <text x={edge.ax + edge.dirA * 14} y={edge.ay - 6} fontSize="11" fontWeight="700"
                            textAnchor="middle" fill={edge.color}>{edge.fromCard}</text>
                          <text x={edge.bx + edge.dirB * 14} y={edge.by - 6} fontSize="11" fontWeight="700"
                            textAnchor="middle" fill={edge.color}>{edge.toCard}</text>
                        </g>
                      ))}
                    </svg>

                    {diagram.nodes.map(({ entity, x, y }) => {
                      const Icon = entity.icon
                      const hex = COLOR_HEX[entity.color] ?? COLOR_HEX.blue
                      const tint = COLOR_TINT[entity.color] ?? COLOR_TINT.blue
                      return (
                        <div
                          key={entity.name}
                          className="er-node"
                          style={{
                            left: x,
                            top: y,
                            width: NODE_W,
                            boxShadow: `0 0 0 1.5px ${hex}, 0 8px 22px #303b5a12`,
                          }}
                        >
                          <div className="er-node-header" style={{ background: tint, color: hex }}>
                            <Icon size={18} />
                            <strong>{entity.name}</strong>
                            <span>{entity.fields.length} fields</span>
                          </div>

                          {entity.fields.length === 0 && <div className="er-field empty">No columns yet</div>}

                          {entity.fields.map((field) => (
                            <div className="er-field" key={field.name}>
                              <span className="er-field-icon">
                                {field.key === 'PK' ? '🔑' : field.key === 'FK' ? '🔗' : '•'}
                              </span>
                              <strong title={field.name}>{field.name}</strong>
                              <small>{field.type}{field.key ? ` · ${field.key}` : ''}</small>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <p className="diagram-footnote">
                Conceptual relationship view. Confirm the foreign keys and cardinality against the actual database schema.
              </p>
            </section>
          )}

          {selectedProject && activePage === 'Documentation' && (
            <Documentation
              key={selectedProject.id}
              docs={docs}
              setDocs={setDocs}
              entities={entities}
              relationships={relationships}
              displayName={displayName}
              projectName={selectedProject.name}
              onLog={logChange}
              readOnly={!canEdit}
            />
          )}

          {selectedProject && activePage === 'Import / Export' && (
            <div className="io-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2><Download size={19} /> Export</h2>
                    <p>ดาวน์โหลดข้อมูลของโปรเจกต์นี้ออกไปใช้งานต่อ</p>
                  </div>
                </div>
                <div className="io-list">
                  <div className="io-row">
                    <div>
                      <strong>SQL script — PostgreSQL</strong>
                      <small>CREATE TABLE, PRIMARY KEY, UNIQUE, COMMENT และ FOREIGN KEY จาก Relationship</small>
                    </div>
                    <button className="secondary-button" onClick={() => exportSql('postgres')} disabled={!entities.length}>
                      Download .sql
                    </button>
                  </div>
                  <div className="io-row">
                    <div>
                      <strong>SQL script — MySQL / MariaDB</strong>
                      <small>ชนิดข้อมูลและ COMMENT แบบ MySQL</small>
                    </div>
                    <button className="secondary-button" onClick={() => exportSql('mysql')} disabled={!entities.length}>
                      Download .sql
                    </button>
                  </div>
                  <div className="io-row">
                    <div>
                      <strong>Data Dictionary (CSV)</strong>
                      <small>เปิดใน Excel ได้ (รองรับภาษาไทย) — ใช้เป็นไฟล์สำหรับนำเข้ากลับได้ด้วย</small>
                    </div>
                    <button className="secondary-button" onClick={exportDictionary} disabled={!allFields.length}>
                      Download .csv
                    </button>
                  </div>
                  <div className="io-row">
                    <div>
                      <strong>ER Diagram — PNG</strong>
                      <small>ภาพความละเอียด 2 เท่า สำหรับใส่เอกสารหรือสไลด์</small>
                    </div>
                    <button className="secondary-button" onClick={exportDiagramPng} disabled={!entities.length}>
                      Download .png
                    </button>
                  </div>
                  <div className="io-row">
                    <div>
                      <strong>ER Diagram — SVG</strong>
                      <small>ภาพเวกเตอร์ ขยายได้ไม่แตก</small>
                    </div>
                    <button className="secondary-button" onClick={exportDiagramSvg} disabled={!entities.length}>
                      Download .svg
                    </button>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2><Upload size={19} /> Import</h2>
                    <p>นำเข้า Entity, Column และ Relationship จากไฟล์ CSV หรือ SQL (ข้ามรายการที่ชื่อซ้ำ ไม่เขียนทับของเดิม)</p>                  </div>
                </div>
                <div className="io-list">
                  <div className="io-row">
                    <div>
                      <strong>เทมเพลต CSV</strong>
                      <small>คอลัมน์: Entity, Field, Type, Key, Nullable, Default, Description</small>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => downloadFile('import_template.csv', buildImportTemplate(), 'text/csv;charset=utf-8')}
                    >
                      Download template
                    </button>
                  </div>
                  {canEdit ? (
                    <div className="io-row">
                      <div>
                        <strong>เลือกไฟล์ที่จะนำเข้า</strong>
                        <small>CSV ไม่เกิน 5 MB · SQL (CREATE TABLE) ไม่เกิน 25 MB · ไฟล์ Excel ให้บันทึกเป็น CSV UTF-8 ก่อน</small>                      </div>
                      <label className="secondary-button io-file">
                        <Upload size={15} /> เลือกไฟล์ CSV / SQL
                        <input type="file" accept=".csv,.tsv,.sql,.txt,text/csv" onChange={handleImportFile} />
                      </label>
                    </div>
                  ) : (
                    <div className="io-row">
                      <div>
                        <strong>นำเข้าข้อมูล</strong>
                        <small>ต้องมีสิทธิ์ Editor หรือ Admin</small>
                      </div>
                    </div>
                  )}
                </div>

                {importPreview && (
                  <div className={`io-preview ${importPreview.error ? 'error' : ''}`}>
                    <strong>{importPreview.fileName}</strong>
                    {importPreview.error ? (
                      <p>{importPreview.error}</p>
                    ) : (
                      <>
                        <div className="io-preview-stats">
                          <span>{importPreview.rows.length} {importPreview.kind === 'sql' ? 'Column' : 'แถว'}</span>
                          <span>เพิ่ม Entity ใหม่ {importResult?.addedEntities ?? 0}</span>
                          <span>เพิ่ม Column {importResult?.addedFields ?? 0}</span>
                          {importPreview.kind === 'sql' && (
                            <span>เพิ่ม Relationship {importResult?.addedRelationships ?? 0}</span>
                          )}
                          <span>ข้าม (ซ้ำ) {importResult?.skippedFields ?? 0}</span>
                        </div>

                        {importPreview.warnings.length > 0 && (
                          <ul className="io-warnings">
                            {importPreview.warnings.slice(0, 50).map((w, i) => <li key={i}>{w}</li>)}
                            {importPreview.warnings.length > 50 && (
                              <li>…และอีก {importPreview.warnings.length - 50} รายการ</li>
                            )}
                          </ul>
                        )}

                        <div className="field-table-wrap">
                          <table className="field-table">
                            <thead>
                              <tr><th>Entity</th><th>Field</th><th>Type</th><th>Key</th><th>Null</th></tr>
                            </thead>
                            <tbody>
                              {importPreview.rows.slice(0, 8).map((r, i) => (
                                <tr key={i}>
                                  <td>{r.entity}</td>
                                  <td className="field-name">{r.field}</td>
                                  <td><span className="type-tag">{r.type}</span></td>
                                  <td>{r.key && <span className={`key-tag ${r.key.toLowerCase()}`}>{r.key}</span>}</td>
                                  <td>{r.nullable ? 'NULL' : 'NOT NULL'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    <div className="io-preview-actions">
                      {!importPreview.error && importPreview.rows.length > 0 && canEdit && (
                        <button className="primary-button" onClick={confirmImport}>
                          <Upload size={15} /> ยืนยันนำเข้า
                        </button>
                      )}
                      <button className="secondary-button" onClick={() => setImportPreview(null)}>
                        {importPreview.error ? 'ปิด' : 'ยกเลิก'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {selectedProject && activePage === 'Notes' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2><FileText size={19} /> Project Notes</h2>
                  <p>บันทึกข้อตกลง วิธีใช้ หรือข้อมูลเพิ่มเติมของโปรเจกต์นี้ (บันทึกอัตโนมัติ)</p>
                </div>
              </div>
              <div className="notes-body">
                <textarea
                  rows={16}
                  readOnly={!canEdit}
                  placeholder="เช่น ข้อตกลงการตั้งชื่อตาราง, วิธีเชื่อมต่อฐานข้อมูล, สิ่งที่ต้องระวัง..."
                  value={selectedProject.notes ?? ''}
                  onFocus={() => { notesFocusRef.current = selectedProject.notes ?? '' }}
                  onChange={(event) => setNotes(event.target.value)}
                  onBlur={() => {
                    if (notesFocusRef.current !== (selectedProject.notes ?? '')) {
                      logChange('update', 'note', 'Project notes', 'แก้ไข Project Notes')
                    }
                  }}
                />
              </div>
            </section>
          )}

          {selectedProject && activePage === 'Changelog' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2><Clock3 size={19} /> Changelog</h2>
                  <p>ประวัติการแก้ไขของโปรเจกต์นี้</p>
                </div>
                <span className="result-count">{changelog.length} entries</span>
              </div>

              {changelog.length === 0 ? (
                <div className="empty-state big">
                  <Clock3 size={30} />
                  <p>ยังไม่มีประวัติการแก้ไข</p>
                  <span>เมื่อมีการเพิ่ม แก้ไข หรือลบข้อมูล รายการจะแสดงที่นี่</span>
                </div>
              ) : (
                <div className="timeline">
                  {changelog.map((log) => (
                    <div className="timeline-item" key={log.id}>
                      <span
                        className={`timeline-dot ${log.action === 'delete'
                          ? 'red-dot'
                          : log.action === 'create'
                            ? 'green-dot'
                            : 'purple-dot'
                          }`}
                      />
                      <div>
                        <strong>{log.summary}</strong>
                        <p>{log.target} · {log.name}</p>
                        <small>
                          {log.by || 'Unknown'} · {new Date(log.at).toLocaleString('th-TH')}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {selectedProject && activePage === 'Members' && (
            <Members
              project={selectedProject}
              members={members[selectedProject.id] ?? []}
              myRole={myRole}
              myEmail={myEmail}
              onInvite={inviteMember}
              onChangeRole={changeMemberRole}
              onRemove={removeMember}
              onRefresh={async () => {
                await loadMembers()
                checkJoinRequestsRef.current?.()
              }}
              onLog={logChange}
            />
          )}
        </section>

        <footer className="app-footer">
          <span>Entity Portal <span className="footer-separator">·</span> Database Documentation</span>
          <span><span className="footer-status-dot" /> Cloud Workspace</span>
        </footer>
      </main>

      {joinCode && (
        <JoinInvite
          code={joinCode}
          onClose={closeJoin}
          onApproved={() => syncProjectListRef.current?.()}
        />
      )}

      {showEntityModal && (
        <div className="project-modal-overlay">
          <form className="project-modal" onSubmit={handleSaveEntity}>
            <div className="project-modal-header">
              <div>
                <h2>{editingEntity ? 'แก้ไข Entity' : 'สร้าง Entity ใหม่'}</h2>
                <p>กำหนดชื่อและรายละเอียดของ Entity</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={closeEntityModal}
              >
                ×
              </button>
            </div>

            <label htmlFor="entity-name">ชื่อ Entity *</label>
            <input
              id="entity-name"
              value={entityName}
              onChange={(event) => setEntityName(event.target.value)}
              placeholder="เช่น CUSTOMERS"
              required
            />

            <label htmlFor="entity-description">รายละเอียด</label>
            <textarea
              id="entity-description"
              value={entityDescription}
              onChange={(event) => setEntityDescription(event.target.value)}
              placeholder="อธิบายข้อมูลของ Entity นี้"
              rows={3}
            />

            <div className="project-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeEntityModal}
              >
                ยกเลิก
              </button>
              <button type="submit" className="primary-button">
                <Plus size={17} />
                {editingEntity ? 'บันทึกการแก้ไข' : 'สร้าง Entity'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showProjectModal && (
        <div className="project-modal-overlay">
          <form className="project-modal" onSubmit={handleSaveProject}>
            <div className="project-modal-header">
              <div>
                <h2>{editingProject ? 'แก้ไขโปรเจกต์' : 'สร้างโปรเจกต์ใหม่'}</h2>
                <p>เพิ่มพื้นที่สำหรับจัดเก็บเอกสารฐานข้อมูล</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={closeProjectModal}
                aria-label="ปิด"
              >
                ×
              </button>
            </div>

            <label htmlFor="project-name">ชื่อโปรเจกต์ *</label>
            <input
              id="project-name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="เช่น Mappoint Database"
              required
              autoFocus
            />

            <label htmlFor="project-description">รายละเอียด</label>
            <textarea
              id="project-description"
              value={projectDescription}
              onChange={(event) => setProjectDescription(event.target.value)}
              placeholder="อธิบายเกี่ยวกับโปรเจกต์นี้"
              rows={3}
            />

            <div className="project-modal-actions">
              <button type="button" className="secondary-button" onClick={closeProjectModal}>
                ยกเลิก
              </button>
              <button type="submit" className="primary-button">
                <Plus size={17} /> {editingProject ? 'บันทึกการแก้ไข' : 'สร้างโปรเจกต์'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showColumnModal && (
        <div className="project-modal-overlay">
          <form className="project-modal" onSubmit={handleSaveColumn}>
            <div className="project-modal-header">
              <div>
                <h2>{editingColumn ? 'แก้ไข Column' : 'เพิ่ม Column'}</h2>
                <p>กำหนดรายละเอียดของ Column ใน {activeEntity?.name}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={closeColumnModal}
              >
                ×
              </button>
            </div>

            <label htmlFor="column-name">ชื่อ Column *</label>
            <input
              id="column-name"
              value={columnName}
              onChange={(event) => setColumnName(event.target.value)}
              placeholder="เช่น user_id"
              required
            />

            <label htmlFor="column-type">Data Type</label>
            <select
              id="column-type"
              value={columnType}
              onChange={(event) => setColumnType(event.target.value)}
            >
              <option value="varchar">VARCHAR</option>
              <option value="int">INT</option>
              <option value="bigint">BIGINT</option>
              <option value="text">TEXT</option>
              <option value="boolean">BOOLEAN</option>
              <option value="date">DATE</option>
              <option value="datetime">DATETIME</option>
              <option value="decimal">DECIMAL</option>
              <option value="uuid">UUID</option>
            </select>

            <label htmlFor="column-key">Key</label>
            <select
              id="column-key"
              value={columnKey}
              onChange={(event) => setColumnKey(event.target.value)}
            >
              <option value="">None</option>
              <option value="PK">Primary Key (PK)</option>
              <option value="FK">Foreign Key (FK)</option>
              <option value="UK">Unique Key (UK)</option>
            </select>

            <label>
              <input
                type="checkbox"
                checked={columnNullable}
                onChange={(event) => setColumnNullable(event.target.checked)}
              />
              Allow NULL
            </label>

            <label htmlFor="column-default">Default Value</label>
            <input
              id="column-default"
              value={columnDefault}
              onChange={(event) => setColumnDefault(event.target.value)}
              placeholder="เช่น NULL หรือ 0"
            />

            <label htmlFor="column-description">Description</label>
            <textarea
              id="column-description"
              value={columnDescription}
              onChange={(event) => setColumnDescription(event.target.value)}
              placeholder="อธิบาย Column นี้"
              rows={3}
            />

            <div className="project-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeColumnModal}
              >
                ยกเลิก
              </button>
              <button type="submit" className="primary-button">
                <Plus size={17} />
                {editingColumn ? 'บันทึกการแก้ไข' : 'เพิ่ม Column'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showRelationshipModal && (
        <div className="project-modal-overlay">
          <form
            className="project-modal relationship-modal"
            onSubmit={handleSaveRelationship}
          >
            <div className="project-modal-header">
              <div>
                <h2>{editingRelationship ? 'Edit Relationship' : 'Add Relationship'}</h2>
                <p>Define how two entities are connected.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowRelationshipModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="form-group">
              <label>From Entity</label>

              <select
                value={relationshipFromEntity}
                onChange={(event) => {
                  const name = event.target.value
                  const entity = entities.find(
                    (item) => item.name === name
                  )

                  setRelationshipFromEntity(name)
                  setRelationshipFromField(
                    entity?.fields[0]?.name || ''
                  )
                }}
                required
              >
                {entities.map((entity) => (
                  <option
                    key={entity.name}
                    value={entity.name}
                  >
                    {entity.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>From Column</label>

              <select
                value={relationshipFromField}
                onChange={(event) =>
                  setRelationshipFromField(event.target.value)
                }
                required
              >
                {(
                  entities.find(
                    (item) =>
                      item.name === relationshipFromEntity
                  )?.fields || []
                ).map((field) => (
                  <option
                    key={field.name}
                    value={field.name}
                  >
                    {field.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="relationship-form-divider">
              <ArrowRight size={20} />
              <span>Connect to</span>
            </div>

            <div className="form-group">
              <label>To Entity</label>

              <select
                value={relationshipToEntity}
                onChange={(event) => {
                  const name = event.target.value
                  const entity = entities.find(
                    (item) => item.name === name
                  )

                  setRelationshipToEntity(name)
                  setRelationshipToField(
                    entity?.fields[0]?.name || ''
                  )
                }}
                required
              >
                {entities.map((entity) => (
                  <option
                    key={entity.name}
                    value={entity.name}
                  >
                    {entity.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>To Column</label>

              <select
                value={relationshipToField}
                onChange={(event) =>
                  setRelationshipToField(event.target.value)
                }
                required
              >
                {(
                  entities.find(
                    (item) =>
                      item.name === relationshipToEntity
                  )?.fields || []
                ).map((field) => (
                  <option
                    key={field.name}
                    value={field.name}
                  >
                    {field.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Relationship Type</label>

              <select
                value={relationshipType}
                onChange={(event) =>
                  setRelationshipType(event.target.value)
                }
              >
                <option value="1:1">One to One (1:1)</option>
                <option value="1:N">One to Many (1:N)</option>
                <option value="N:M">Many to Many (N:M)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Relationship Name</label>

              <input
                type="text"
                value={relationshipLabel}
                onChange={(event) =>
                  setRelationshipLabel(event.target.value)
                }
                placeholder="e.g. creates, belongs to"
              />
            </div>

            <div className="form-group">
              <label>Description</label>

              <textarea
                value={relationshipDetail}
                onChange={(event) =>
                  setRelationshipDetail(event.target.value)
                }
                placeholder="Describe this relationship..."
                rows={3}
              />
            </div>

            <div className="project-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setShowRelationshipModal(false)
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-button"
              >
                {editingRelationship ? 'Save Changes' : 'Add Relationship'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, note, color }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}><Icon size={20} /></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  )
}

export default App