import { useMemo, useState, useEffect } from 'react'
import { supabase } from './supabase'
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Database,
  FileText,
  GitBranch,
  LayoutDashboard,
  Link2,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Table2,
  Users,
} from 'lucide-react'
import './App.css'

const entities = [
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

const relationships = [
  { from: 'USERS', to: 'POSTS', label: 'creates', detail: 'ผู้ใช้หนึ่งคนสร้างโพสต์ได้หลายรายการ', color: 'green' },
  { from: 'USERS', to: 'FOLLOWS', label: 'following', detail: 'ผู้ใช้หนึ่งคนมีรายการติดตามได้หลายรายการ', color: 'purple' },
  { from: 'USERS', to: 'FOLLOWS', label: 'followed', detail: 'ผู้ใช้หนึ่งคนถูกติดตามได้หลายรายการ', color: 'blue' },
]

function App() {
  const [activePage, setActivePage] = useState('Overview')
  const [session, setSession] = useState(undefined)
  const [search, setSearch] = useState('')
  const [selectedEntity, setSelectedEntity] = useState('USERS')

  const allFields = useMemo(
    () => entities.flatMap((entity) =>
      entity.fields.map((field) => ({ ...field, entity: entity.name, color: entity.color })),
    ),
    [],
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

  const activeEntity = entities.find((entity) => entity.name === selectedEntity) ?? entities[0]

  const navItems = [
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

        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-switch">
          <div className="workspace-avatar">M</div>
          <div className="workspace-copy">
            <strong>Mappoint Project</strong>
            <span>Documentation space</span>
          </div>
          <ChevronDown size={16} />
        </div>

        <div className="nav-label">MENU</div>
        <nav className="navigation">
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${activePage === label ? 'active' : ''}`}
              onClick={() => setActivePage(label)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === 'Entities' && <span className="nav-count">3</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><CircleHelp size={19} /></div>
            <strong>Keep your data documented</strong>
            <p>Clear documentation helps teams build better systems together.</p>
          </div>
          <div className="repo-label">
            <GitBranch size={17} />
            <div>
              <strong>GitHub Repository</strong>
              <span>entity-documentation-demo</span>
            </div>
            <CheckCircle2 size={16} className="repo-check" />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span><span className="crumb-separator">/</span>
            <strong>{activePage}</strong>
          </div>
          <div className="topbar-actions">
            <span className="status-pill">
              <span className="status-dot" /> Demo data
            </span>
            <button
              className="text-button"
              onClick={handleGoogleLogin}
            >
              Continue with Google
            </button>
            <button className="icon-button" aria-label="Settings"><Settings2 size={18} /></button>
            <div className="avatar">P</div>
          </div>
        </header>

        <section className="page-content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> DATABASE WORKSPACE</div>
              <h1>{activePage === 'Overview' ? 'Good afternoon!' : activePage}</h1>
              <p className="welcome-description">
                Explore your database structure, entities, and relationships in one place.
              </p>
            </div>
            <button className="primary-button" onClick={() => setActivePage('Entities')}>
              <Plus size={17} /> Explore entities <ArrowRight size={16} />
            </button>
          </div>

          <div className="notice-banner">
            <div className="notice-icon"><ShieldCheck size={20} /></div>
            <div>
              <strong>Documentation workspace</strong>
              <p>This version uses sample data. Verify field definitions against your actual database schema.</p>
            </div>
            <span className="notice-tag">DEMO</span>
          </div>

          <div className="stats-grid">
            <StatCard icon={Database} label="Total Entities" value={entities.length} note="Database tables" color="blue" />
            <StatCard icon={Table2} label="Total Fields" value={allFields.length} note="Across all entities" color="green" />
            <StatCard icon={Link2} label="Relationships" value={relationships.length} note="Documented links" color="purple" />
            <StatCard icon={Activity} label="Documentation" value="Draft" note="Ready for review" color="orange" />
          </div>

          {activePage === 'Overview' && (
            <div className="content-grid">
              <section className="panel entity-panel">
                <div className="panel-heading">
                  <div>
                    <h2><Database size={19} /> Entity Catalog</h2>
                    <p>Browse the main tables in your system</p>
                  </div>
                  <button className="text-button" onClick={() => setActivePage('Entities')}>View all <ArrowRight size={15} /></button>
                </div>
                <div className="entity-list">
                  {entities.map((entity) => (
                    <button
                      key={entity.name}
                      className="entity-row"
                      onClick={() => { setSelectedEntity(entity.name); setActivePage('Entities') }}
                    >
                      <div className={`entity-icon ${entity.color}`}><entity.icon size={19} /></div>
                      <div className="entity-row-copy">
                        <strong>{entity.name}</strong>
                        <span>{entity.description}</span>
                      </div>
                      <span className="field-count">{entity.fields.length} fields</span>
                      <ArrowRight size={16} className="row-arrow" />
                    </button>
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
                <button className="quick-link" onClick={() => setActivePage('ER Diagram')}>
                  <span className="quick-icon purple"><GitBranch size={18} /></span>
                  <span><strong>ER Diagram</strong><small>Explore table relationships</small></span>
                  <ArrowRight size={16} />
                </button>
                <button className="quick-link" onClick={() => setActivePage('Data Dictionary')}>
                  <span className="quick-icon green"><BookOpen size={18} /></span>
                  <span><strong>Data Dictionary</strong><small>Browse every field</small></span>
                  <ArrowRight size={16} />
                </button>
                <button className="quick-link" onClick={() => setActivePage('Relationships')}>
                  <span className="quick-icon blue"><Link2 size={18} /></span>
                  <span><strong>Relationships</strong><small>Understand data connections</small></span>
                  <ArrowRight size={16} />
                </button>
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
                  <div><h2><Database size={19} /> Entities</h2><p>Select a table to see its fields</p></div>
                  <span className="result-count">{filteredEntities.length} results</span>
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
                <div className="detail-header">
                  <div className={`entity-icon large ${activeEntity.color}`}><activeEntity.icon size={22} /></div>
                  <div><div className="eyebrow">ENTITY DETAILS</div><h2>{activeEntity.name}</h2><p>{activeEntity.description}</p></div>
                </div>
                <div className="field-table-wrap">
                  <table className="field-table">
                    <thead><tr><th>Field</th><th>Type</th><th>Key</th><th>Description</th></tr></thead>
                    <tbody>{activeEntity.fields.map((field) => (
                      <tr key={field.name}><td className="field-name">{field.name}</td><td><span className="type-tag">{field.type}</span></td><td>{field.key && <span className={`key-tag ${field.key.toLowerCase()}`}>{field.key}</span>}</td><td>{field.description}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="detail-footer"><span><Table2 size={15} /> {activeEntity.fields.length} fields documented</span><span className="draft-label">Draft schema</span></div>
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
                <div><h2><Link2 size={19} /> Relationship Catalog</h2><p>Documented links between database entities</p></div>
                <span className="result-count">{relationships.length} relationships</span>
              </div>
              <div className="relationship-list">
                {relationships.map((rel, index) => (
                  <div className="relationship-row" key={`${rel.label}-${index}`}>
                    <span className={`entity-badge ${rel.color}`}>{rel.from}</span>
                    <ArrowRight size={18} className="relationship-arrow" />
                    <span className="entity-badge purple">{rel.to}</span>
                    <span className="relationship-label">{rel.label}</span>
                    <p>{rel.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          )}


          {activePage === 'ER Diagram' && (
            <section className="panel diagram-panel">
              <div className="panel-heading">
                <div>
                  <h2><GitBranch size={19} /> Entity Relationship Diagram</h2>
                  <p>Relationships between USERS, POSTS and FOLLOWS</p>
                </div>
                <span className="result-count">3 entities · 3 links</span>
              </div>

              <div className="diagram-canvas">
                <div className="diagram-grid connected-diagram">
                  <div className="diagram-node node-users">
                    <div className="diagram-entity-header">
                      <Users size={18} />
                      <strong>USERS</strong>
                      <span>4 fields</span>
                    </div>
                    <div className="diagram-field"><strong>🔑 id</strong><small>int · PK</small></div>
                    <div className="diagram-field"><strong>username</strong><small>string</small></div>
                    <div className="diagram-field"><strong>role</strong><small>string</small></div>
                    <div className="diagram-field"><strong>created_at</strong><small>datetime</small></div>
                  </div>

                  <svg className="diagram-lines" viewBox="0 0 800 460" preserveAspectRatio="none" aria-label="Relationship lines">
                    <defs>
                      <marker id="arrow-posts" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                        <path d="M0,0 L6,3 L0,6 Z" fill="#20a98a" />
                      </marker>
                      <marker id="arrow-follows" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                        <path d="M0,0 L6,3 L0,6 Z" fill="#8b69e8" />
                      </marker>
                    </defs>
                    <path d="M250 90 C350 90 350 90 450 90" stroke="#20a98a" strokeWidth="2.5" fill="none" markerEnd="url(#arrow-posts)" />
                    <path d="M130 190 C130 300 220 300 300 300" stroke="#8b69e8" strokeWidth="2.5" fill="none" markerEnd="url(#arrow-follows)" />
                    <path d="M250 350 C350 350 350 350 450 350" stroke="#5689ed" strokeWidth="2.5" fill="none" />
                    <rect x="320" y="68" width="70" height="24" rx="12" fill="#e4f8f1" />
                    <text x="355" y="84" fontSize="11" textAnchor="middle" fill="#16866e">creates</text>
                    <rect x="145" y="235" width="80" height="24" rx="12" fill="#f0eaff" />
                    <text x="185" y="251" fontSize="11" textAnchor="middle" fill="#7958d2">following</text>
                    <rect x="320" y="328" width="70" height="24" rx="12" fill="#eaf1ff" />
                    <text x="355" y="344" fontSize="11" textAnchor="middle" fill="#4778d2">followed</text>
                  </svg>

                  <div className="diagram-node node-posts">
                    <div className="diagram-entity-header">
                      <FileText size={18} />
                      <strong>POSTS</strong>
                      <span>6 fields</span>
                    </div>
                    <div className="diagram-field"><strong>🔑 id</strong><small>int · PK</small></div>
                    <div className="diagram-field"><strong>title</strong><small>string</small></div>
                    <div className="diagram-field"><strong>🔗 user_id</strong><small>int · FK</small></div>
                    <div className="diagram-field"><strong>status</strong><small>string</small></div>
                  </div>

                  <div className="diagram-node node-follows">
                    <div className="diagram-entity-header">
                      <GitBranch size={18} />
                      <strong>FOLLOWS</strong>
                      <span>3 fields</span>
                    </div>
                    <div className="diagram-field"><strong>🔗 following_user_id</strong><small>int · FK</small></div>
                    <div className="diagram-field"><strong>🔗 followed_user_id</strong><small>int · FK</small></div>
                    <div className="diagram-field"><strong>created_at</strong><small>datetime</small></div>
                  </div>
                </div>
              </div>
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

function DiagramEntity({ entity }) {
  const Icon = entity.icon
  return (
    <div className={`diagram-entity ${entity.color}`}>
      <div className="diagram-entity-header"><Icon size={18} /><strong>{entity.name}</strong><span>{entity.fields.length} fields</span></div>
      {entity.fields.slice(0, 4).map((field) => (
        <div className="diagram-field" key={field.name}>
          <span>{field.key === 'PK' ? '🔑' : field.key === 'FK' ? '🔗' : '•'}</span>
          <strong>{field.name}</strong>
          <small>{field.type}</small>
          {field.key && <span className={`key-tag ${field.key.toLowerCase()}`}>{field.key}</span>}
        </div>
      ))}
      {entity.fields.length > 4 && <div className="diagram-more">+{entity.fields.length - 4} more fields</div>}
    </div>
  )
}

export default App
