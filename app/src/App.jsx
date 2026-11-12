import { useMemo, useState, useEffect } from 'react'
import { supabase } from './supabase'
import {
  Activity,
  ArrowDownRight,
  FolderKanban,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  FileText,
  GitBranch,
  LayoutDashboard,
  Link2,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Settings2,
  ShieldCheck,
  Table2,
  Users,
} from 'lucide-react'
import './App.css'

const initialEntities = [
  {
    name: 'USERS',
    description: 'ข้อมูลผู้ใช้และบัญชีของระบบ',
    color: 'blue',
    icon: Users,
    fields: [
      { name: 'id', type: 'int', key: 'PK', description: 'รหัสผู้ใช้' },
      { name: 'username', type: 'string', key: '', description: 'ชื่อผู้ใช้' },
      { name: 'role', type: 'string', key: '', description: 'บทบาทผู้ใช้' },
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
      { name: 'title', type: 'string', key: '', description: 'หัวข้อโพสต์' },
      { name: 'body', type: 'text', key: '', description: 'เนื้อหาโพสต์' },
      { name: 'user_id', type: 'int', key: 'FK', description: 'ผู้สร้างโพสต์' },
      { name: 'status', type: 'string', key: '', description: 'สถานะโพสต์' },
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

//const [showProjectMenu, setShowProjectMenu] = useState(false)
//const [editingProject, setEditingProject] = useState(null)


function App() {
  const [activePage, setActivePage] = useState('Projects')
  const [session, setSession] = useState(undefined)
  const [search, setSearch] = useState('')
  //const [selectedEntity, setSelectedEntity] = useState('USERS')
  //const [entities, setEntities] = useState(initialEntities)
  // Relationship Management
  //const [relationships, setRelationships] = useState(initialRelationships)
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
  //const [projects, setProjects] = useState([])
  //const [selectedProject, setSelectedProject] = useState(null)
  const [projects, setProjects] = useState(initialProjects)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [selectedEntity, setSelectedEntity] = useState('')
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')

  // โปรเจกต์ที่เปิดอยู่ และข้อมูลของโปรเจกต์นั้น
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null
  const entities = selectedProject?.entities ?? []
  const relationships = selectedProject?.relationships ?? []

  const [showProjectMenu, setShowProjectMenu] = useState(false)
  const [editingProject, setEditingProject] = useState(null)

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

  const setEntities = (updater) => updateProjectData('entities', updater)
  const setRelationships = (updater) => updateProjectData('relationships', updater)

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
    { label: 'Changelog', icon: Clock3 },
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

  const handleSaveProject = (event) => {
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

    if (editingProject) {
      setProjects((current) =>
        current.map((project) =>
          project.id === editingProject.id
            ? { ...project, name, description: projectDescription.trim() }
            : project
        )
      )
      closeProjectModal()
      return
    }
    // สร้างโปรเจกต์ใหม่ แล้วเข้าไปที่หน้า Entities ทันที
    const newProject = {
      id: Date.now(),
      name,
      description: projectDescription.trim(),
      entities: [],
      relationships: [],
    }

    setProjects((current) => [...current, newProject])
    closeProjectModal()
    openProject(newProject)
    setActivePage('Entities')
  }

  const handleSaveEntity = (event) => {
    event.preventDefault()

    const name = entityName.trim().toUpperCase()
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

      setSelectedEntity(name)

    } else {
      setEntities((current) => [
        ...current,
        {
          name,
          description,
          color: ['blue', 'green', 'purple', 'orange'][entities.length % 4],
          icon: Database,
          fields: [],
        },
      ])

      setSelectedEntity(name)
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
    setActivePage('Overview')
  }

  const closeProject = () => {
    setSelectedProjectId(null)
    setActivePage('Projects')
  }

  const handleDeleteProject = (project) => {
    const confirmed = window.confirm(
      `ต้องการลบโปรเจกต์ "${project.name}" และข้อมูลทั้งหมดในโปรเจกต์ใช่หรือไม่?`
    )
    if (!confirmed) return

    setProjects((current) => current.filter((p) => p.id !== project.id))
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

    if (!activeEntity) return

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

    setShowColumnModal(false)
    setEditingColumn(null)
    setColumnName('')
    setColumnType('varchar')
    setColumnKey('')
    setColumnNullable(true)
    setColumnDefault('')
    setColumnDescription('')
  }


  // Delete Column

  const handleDeleteColumn = (fieldName) => {
    if (!activeEntity) return

    const confirmed = window.confirm(
      `ต้องการลบ Column "${fieldName}" จาก ${activeEntity.name} ใช่หรือไม่?`
    )

    if (!confirmed) return

    const entityName = activeEntity.name

    // ลบ Column จาก Entity
    setEntities((currentEntities) =>
      currentEntities.map((entity) => {
        if (entity.name !== entityName) return entity

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
            (rel.fromEntity === entityName &&
              rel.fromField === fieldName) ||
            (rel.toEntity === entityName &&
              rel.toField === fieldName)
          )
      )
    )
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

    setShowRelationshipModal(false)
    setEditingRelationship(null)
  }

  // Delete Relationship
  const handleDeleteRelationship = (id) => {
    const confirmed = window.confirm(
      'คุณต้องการลบ Relationship นี้ใช่หรือไม่?'
    )

    if (!confirmed) return

    setRelationships((current) =>
      current.filter((relationship) => relationship.id !== id)
    )
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

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
                  <span>{entities.length} entities · {relationships.length} links</span>
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

                    <button
                      type="button"
                      className="workspace-action"
                      onClick={() => openProjectModal(selectedProject)}
                    >
                      <Pencil size={15} /> แก้ไขโปรเจกต์นี้
                    </button>
                    <button
                      type="button"
                      className="workspace-action"
                      onClick={() => openProjectModal()}
                    >
                      <Plus size={15} /> สร้างโปรเจกต์ใหม่
                    </button>
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
            <span className="status-pill">
              <span className="status-dot" /> Demo data
            </span>
            <button
              className="text-button"
              onClick={() => handleLogout()}
            >
              Logout
            </button>
            <button className="icon-button" aria-label="Settings"><Settings2 size={18} /></button>
            <div className="avatar">P</div>
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

              <div className="project-grid">
                {projects.map((project) => (
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

                    <div className="project-card-actions">
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
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="project-card project-card-new"
                  onClick={() => openProjectModal()}
                >
                  <Plus size={26} />
                  <strong>สร้างโปรเจกต์ใหม่</strong>
                </button>
              </div>
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

              {activePage === 'Overview' && (
                <div className="notice-banner">
                  <div className="notice-icon"><ShieldCheck size={20} /></div>
                  <div>
                    <strong>Documentation workspace</strong>
                    <p>This version uses sample data. Verify field definitions against your actual database schema.</p>
                  </div>
                  <span className="notice-tag">DEMO</span>
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

          {activePage === 'Overview' && (
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

                <div className="quick-link">
                  <span className="quick-icon purple"><GitBranch size={18} /></span>
                  <span><strong>ER Diagram</strong><small>Explore table relationships</small></span>
                </div>
                <div className="quick-link">
                  <span className="quick-icon green"><BookOpen size={18} /></span>
                  <span><strong>Data Dictionary</strong><small>Browse every field</small></span>
                </div>
                <div className="quick-link">
                  <span className="quick-icon blue"><Link2 size={18} /></span>
                  <span><strong>Relationships</strong><small>Understand data connections</small></span>
                </div>

                <div className="review-note">
                  <ArrowDownRight size={17} />
                  <span>Keep definitions clear, consistent, and up to date.</span>
                </div>
              </section>
            </div>
          )}

          {activePage === 'Entities' && (
            <div className="content-grid entity-detail-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2><Database size={19} /> Entities</h2>
                    <p>Select a table to see its fields</p>
                  </div>

                  <button
                    className="primary-button"
                    onClick={() => openEntityModal()}
                  >
                    <Plus size={17} /> New Entity
                  </button>
                </div>


                <div className="search-box">
                  <Search size={17} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entities or fields..." />
                </div>
                <div className="entity-list">
                  {filteredEntities.map((entity) => (
                    <button key={entity.name} className={`entity-row ${selectedEntity === entity.name ? 'selected' : ''}`} onClick={() => setSelectedEntity(entity.name)}>
                      <div className={`entity-icon ${entity.color}`}><entity.icon size={19} /></div>
                      <div className="entity-row-copy"><strong>{entity.name}</strong><span>{entity.description}</span></div>
                      <span className="field-count">{entity.fields.length} fields</span>
                    </button>
                  ))}
                  {filteredEntities.length === 0 && <p className="empty-state">No matching entities found.</p>}
                </div>
              </section>
              <section className="panel detail-panel">
                {entities.length === 0 ? (
                  <div className="empty-state">
                    <Database size={30} />
                    <p>No entities yet</p>
                    <span>Create a new Entity to start documenting your database.</span>
                    <button
                      className="primary-button"
                      onClick={() => openEntityModal()}
                    >
                      <Plus size={17} /> New Entity
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="detail-header">
                      <div className={`entity-icon large ${activeEntity.color}`}><activeEntity.icon size={22} /></div>
                      <div><div className="eyebrow">ENTITY DETAILS</div><h2>{activeEntity.name}</h2><p>{activeEntity.description}</p></div>
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

                      <span className="result-count">{filteredActiveFields.length} columns</span>

                      <div className="toolbar-actions">
                        <button className="secondary-button" onClick={() => openEntityModal(activeEntity)}>
                          Edit Entity
                        </button>
                        <button className="secondary-button danger-button" onClick={() => handleDeleteEntity(activeEntity.name)}>
                          Delete
                        </button>
                        <button className="primary-button" onClick={() => openColumnModal()}>
                          <Plus size={17} /> Add Column
                        </button>
                      </div>
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
                            <th>Actions</th>
                          </tr>
                        </thead>

                        <tbody>
                          {filteredActiveFields.map((field) => (
                            <tr key={field.name}>
                              <td className="field-name">{field.name}</td>
                              <td><span className="type-tag">{field.type}</span></td>
                              <td>
                                {field.key && (
                                  <span className={`key-tag ${field.key.toLowerCase()}`}>
                                    {field.key}
                                  </span>
                                )}
                              </td>

                              <td>{field.nullable === false ? 'NOT NULL' : 'NULL'}</td>
                              <td>{field.defaultValue || '-'}</td>
                              <td>{field.description}</td>

                              <td>
                                <button
                                  className="secondary-button"
                                  onClick={() => openColumnModal(field)}
                                >
                                  Edit
                                </button>

                                <button
                                  className="secondary-button"
                                  onClick={() => handleDeleteColumn(field.name)}
                                >
                                  Delete
                                </button>

                              </td>
                            </tr>
                          ))}
                        </tbody>

                      </table>
                    </div>
                    <div className="detail-footer">
                      <span>
                        <Table2 size={15} /> {activeEntity.fields.length} fields documented
                      </span>
                      <span className="draft-label">Draft schema</span>
                    </div>
                  </>
                )}
              </section>
            </div>
          )}

          {activePage === 'Data Dictionary' && (
            <section className="panel">
              <div className="panel-heading">
                <div><h2><BookOpen size={19} /> Data Dictionary</h2><p>Search fields across all documented entities</p></div>
                <span className="result-count">{filteredFields.length} fields</span>
              </div>
              <div className="search-box dictionary-search">
                <Search size={17} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search field, type, entity, or description..." />
              </div>
              <div className="field-table-wrap">
                <table className="field-table">
                  <thead><tr><th>Field</th><th>Entity</th><th>Type</th><th>Key</th><th>Description</th></tr></thead>
                  <tbody>{filteredFields.map((field) => (
                    <tr key={`${field.entity}-${field.name}`}><td className="field-name">{field.name}</td><td><span className={`entity-badge ${field.color}`}>{field.entity}</span></td><td><span className="type-tag">{field.type}</span></td><td>{field.key && <span className={`key-tag ${field.key.toLowerCase()}`}>{field.key}</span>}</td><td>{field.description}</td></tr>
                  ))}</tbody>
                </table>
                {filteredFields.length === 0 && <p className="empty-state">No matching fields found.</p>}
              </div>
            </section>
          )}

          {activePage === 'Relationships' && (
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

                <button
                  className="primary-button"
                  onClick={() => openRelationshipModal()}
                >
                  <Plus size={16} />
                  Add Relationship
                </button>
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
                  </div>
                ))}

                {relationships.length === 0 && (
                  <div className="empty-state">
                    <Link2 size={30} />
                    <p>No relationships yet</p>
                    <span>
                      Click Add Relationship to create your first connection.
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}


          {activePage === 'ER Diagram' && (
            <section className="panel diagram-panel">
              <div className="panel-heading">
                <div>
                  <h2><GitBranch size={19} /> Entity Relationship Diagram</h2>
                  <p>Diagram updates automatically from your entities and relationships</p>
                </div>
                <span className="result-count">
                  {entities.length} entities · {diagram.edges.length} links
                </span>
              </div>

              {entities.length === 0 ? (
                <div className="empty-state">
                  <GitBranch size={30} />
                  <p>No entities to display</p>
                  <span>Create an entity first, then it will appear here.</span>
                </div>
              ) : (
                <div className="diagram-canvas">
                  <div className="er-board" style={{ width: diagram.width, height: diagram.height }}>
                    <svg className="er-lines" width={diagram.width} height={diagram.height}>
                      {diagram.edges.map((edge) => {
                        const text = edge.label || ''
                        const pillW = text.length * 6.5 + 18
                        return (
                          <g key={edge.id}>
                            <path d={edge.d} stroke={edge.color} strokeWidth="2" fill="none" />
                            <circle cx={edge.ax} cy={edge.ay} r="3.5" fill={edge.color} />
                            <circle cx={edge.bx} cy={edge.by} r="3.5" fill={edge.color} />

                            <text x={edge.ax + edge.dirA * 14} y={edge.ay - 6} fontSize="11" fontWeight="700"
                              textAnchor="middle" fill={edge.color}>{edge.fromCard}</text>
                            <text x={edge.bx + edge.dirB * 14} y={edge.by - 6} fontSize="11" fontWeight="700"
                              textAnchor="middle" fill={edge.color}>{edge.toCard}</text>

                            {text && (
                              <>
                                <rect x={edge.mx - pillW / 2} y={edge.my - 11} width={pillW} height="22"
                                  rx="11" fill="#fff" stroke={edge.color} strokeWidth="1" />
                                <text x={edge.mx} y={edge.my + 4} fontSize="10.5" textAnchor="middle"
                                  fill={edge.color}>{text}</text>
                              </>
                            )}
                          </g>
                        )
                      })}
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


          {activePage === 'Changelog' && (
            <section className="panel">
              <div className="panel-heading"><div><h2><Clock3 size={19} /> Changelog</h2><p>Documentation activity</p></div></div>
              <div className="timeline">
                <div className="timeline-item"><span className="timeline-dot" /><div><strong>Entity portal initialized</strong><p>Created the first dashboard and sample entity catalog.</p><small>Local demo · Not yet saved as an activity record</small></div></div>
                <div className="timeline-item"><span className="timeline-dot purple-dot" /><div><strong>Schema documentation drafted</strong><p>USERS, POSTS, and FOLLOWS are displayed as example entities.</p><small>Review needed before production use</small></div></div>
              </div>
            </section>
          )}
        </section>




        <footer className="app-footer">
          <span>Entity Portal <span className="footer-separator">·</span> Database Documentation</span>
          <span><span className="footer-status-dot" /> Local demo workspace</span>
        </footer>
      </main>

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
                  const entityName = event.target.value
                  const entity = entities.find(
                    (item) => item.name === entityName
                  )

                  setRelationshipFromEntity(entityName)
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
                  const entityName = event.target.value
                  const entity = entities.find(
                    (item) => item.name === entityName
                  )

                  setRelationshipToEntity(entityName)
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
