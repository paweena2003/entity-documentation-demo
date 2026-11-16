import { useState } from 'react'
import { Mail, LogOut, Trash2, UserPlus, Users } from 'lucide-react'

export const ROLE_LABEL = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' }

const ROLE_DESC = {
  admin: 'จัดการสมาชิก แก้ไขข้อมูล และตั้งค่าโปรเจกต์ได้',
  editor: 'เพิ่ม แก้ไข ลบ Entity, Column, Relationship และเอกสารได้',
  viewer: 'ดูและส่งออกข้อมูลได้อย่างเดียว',
}

export default function Members({
  project,
  members = [],
  myRole,
  myEmail,
  onInvite,
  onChangeRole,
  onRemove,
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [busy, setBusy] = useState(false)

  const isAdmin = myRole === 'admin'
  const isOwnerRow = (m) => Boolean(m.user_id) && m.user_id === project.userId
  const isMe = (m) => (m.email ?? '').toLowerCase() === myEmail

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const ok = await onInvite(email, role)
    setBusy(false)
    if (ok) setEmail('')
  }

  return (
    <div className="members-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2><Users size={19} /> Members</h2>
            <p>คนที่เข้าถึงโปรเจกต์นี้ได้ ({members.length} คน)</p>
          </div>
        </div>

        {isAdmin && (
          <form className="members-invite" onSubmit={submit}>
            <div className="search-box members-email">
              <Mail size={16} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="อีเมล Google ของผู้ที่ต้องการเชิญ"
                required
              />
            </div>
            <select
              className="filter-select"
              aria-label="Role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button type="submit" className="primary-button" disabled={busy}>
              <UserPlus size={16} /> {busy ? 'กำลังเชิญ...' : 'เชิญ'}
            </button>
          </form>
        )}
        {isAdmin && (
          <p className="members-hint">
            ระบบยังไม่ส่งอีเมลเชิญ — ผู้ถูกเชิญต้องล็อกอินด้วยอีเมล Google นี้ จึงจะเห็นโปรเจกต์
          </p>
        )}

        <div className="members-list">
          {members.map((m) => {
            const owner = isOwnerRow(m)
            const me = isMe(m)
            return (
              <div className="member-row" key={m.id}>
                <div className="member-avatar">{(m.email ?? '?').charAt(0).toUpperCase()}</div>
                <div className="member-copy">
                  <strong>
                    {m.email}
                    {me && <span className="member-you">คุณ</span>}
                  </strong>
                  <small>
                    {owner ? 'เจ้าของโปรเจกต์' : m.user_id ? 'เข้าร่วมแล้ว' : 'รอเข้าสู่ระบบครั้งแรก'}
                  </small>
                </div>

                {isAdmin && !owner ? (
                  <select
                    className="filter-select member-role-select"
                    aria-label={`Role ของ ${m.email}`}
                    value={m.role}
                    onChange={(event) => onChangeRole(m, event.target.value)}
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : (
                  <span className={`role-badge role-${m.role}`}>{ROLE_LABEL[m.role]}</span>
                )}

                {!owner && (isAdmin || me) && (
                  <button
                    type="button"
                    className="icon-button member-remove"
                    title={me ? 'ออกจากโปรเจกต์' : 'นำออกจากโปรเจกต์'}
                    onClick={() => onRemove(m)}
                  >
                    {me ? <LogOut size={16} /> : <Trash2 size={16} />}
                  </button>
                )}
              </div>
            )
          })}
          {members.length === 0 && <p className="empty-state">ยังไม่มีข้อมูลสมาชิก</p>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>บทบาทและสิทธิ์</h2>
            <p>บทบาทของคุณในโปรเจกต์นี้: <strong>{ROLE_LABEL[myRole] ?? '-'}</strong></p>
          </div>
        </div>
        <div className="role-legend">
          {Object.keys(ROLE_LABEL).map((r) => (
            <div className="role-legend-row" key={r}>
              <span className={`role-badge role-${r}`}>{ROLE_LABEL[r]}</span>
              <span>{ROLE_DESC[r]}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
