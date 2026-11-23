import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Link2, LogOut, Mail, Trash2, UserPlus, Users, X } from 'lucide-react'
import { supabase } from './supabase'

export const ROLE_LABEL = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' }

const ROLE_DESC = {
  admin: 'จัดการสมาชิก แก้ไขข้อมูล และตั้งค่าโปรเจกต์ได้',
  editor: 'เพิ่ม แก้ไข ลบ Entity, Column, Relationship และเอกสารได้',
  viewer: 'ดูและส่งออกข้อมูลได้อย่างเดียว',
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  document.body.removeChild(area)
}

export default function Members({
  project,
  members = [],
  myRole,
  myEmail,
  onInvite,
  onChangeRole,
  onRemove,
  onRefresh,
  onLog,
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [busy, setBusy] = useState(false)

  const [link, setLink] = useState(null)
  const [linkBusy, setLinkBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [requests, setRequests] = useState([])
  const [roleFor, setRoleFor] = useState({})
  const [setupMissing, setSetupMissing] = useState(false)

  const isAdmin = myRole === 'admin'
  const isOwnerRow = (m) => Boolean(m.user_id) && m.user_id === project.userId
  const isMe = (m) => (m.email ?? '').toLowerCase() === myEmail
  const linkUrl = link ? `${window.location.origin}/?join=${link.code}` : ''

  const loadInviteData = useCallback(async () => {
    if (!isAdmin) return
    const [linkRes, reqRes] = await Promise.all([
      supabase
        .from('project_invite_links')
        .select('*')
        .eq('project_id', project.id)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('project_join_requests')
        .select('*')
        .eq('project_id', project.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
    ])
    if (linkRes.error || reqRes.error) {
      setSetupMissing(true)
      return
    }
    setSetupMissing(false)
    setLink(linkRes.data?.[0] ?? null)
    setRequests(reqRes.data ?? [])
  }, [isAdmin, project.id])

  useEffect(() => {
    loadInviteData()
    // เผื่อ session ยังไม่พร้อมตอนเปิดหน้านี้ครั้งแรก
    const retry = setTimeout(loadInviteData, 1500)
    const refresh = () => {
      if (document.visibilityState === 'visible') loadInviteData()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearTimeout(retry)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [loadInviteData])

  // คำขอใหม่เด้งเข้ามาทันที
  useEffect(() => {
    if (!isAdmin) return
    const channel = supabase
      .channel(`join-requests-${project.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_join_requests' }, () =>
        loadInviteData(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [isAdmin, project.id, loadInviteData])

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const ok = await onInvite(email, role)
    setBusy(false)
    if (ok) setEmail('')
  }

  const createLink = async () => {
    setLinkBusy(true)
    if (link) {
      await supabase.from('project_invite_links').update({ active: false }).eq('id', link.id)
    }
    const { data, error } = await supabase
      .from('project_invite_links')
      .insert({ project_id: project.id })
      .select()
      .single()
    setLinkBusy(false)
    if (error) {
      alert('สร้างลิงก์ไม่สำเร็จ: ' + error.message)
      return
    }
    setLink(data)
    onLog?.('create', 'invite', 'ลิงก์เชิญ', 'สร้างลิงก์เชิญเข้าร่วมโปรเจกต์')
    setCopied(false)
  }

  const closeLink = async () => {
    if (!link) return
    if (!window.confirm('ปิดลิงก์นี้ใช่หรือไม่? คนที่มีลิงก์จะส่งคำขอไม่ได้อีก')) return
    const { error } = await supabase.from('project_invite_links').update({ active: false }).eq('id', link.id)
    if (error) {
      alert('ปิดลิงก์ไม่สำเร็จ: ' + error.message)
      return
    }
    setLink(null)
    onLog?.('delete', 'invite', 'ลิงก์เชิญ', 'ปิดลิงก์เชิญ')
  }

  const handleCopy = async () => {
    try {
      await copyText(linkUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      alert('คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกเอง')
    }
  }

  const approve = async (req) => {
    const chosen = roleFor[req.id] ?? 'viewer'
    const { error } = await supabase.rpc('approve_join_request', { p_request: req.id, p_role: chosen })
    if (error) {
      alert('อนุมัติไม่สำเร็จ: ' + error.message)
      return
    }
    onLog?.('create', 'member', req.email, `อนุมัติ ${req.email} เป็น ${ROLE_LABEL[chosen]}`)
    await loadInviteData()
    await onRefresh?.()
  }

  const reject = async (req) => {
    const { error } = await supabase
      .from('project_join_requests')
      .update({ status: 'rejected' })
      .eq('id', req.id)
    if (error) {
      alert('ปฏิเสธไม่สำเร็จ: ' + error.message)
      return
    }
    onLog?.('delete', 'member', req.email, `ปฏิเสธคำขอเข้าร่วมของ ${req.email}`)
    await loadInviteData()
    await onRefresh?.()
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
          <div className="invite-card">
            <div className="invite-card-head">
              <div className="invite-card-icon">
                <Link2 size={18} />
              </div>
              <div className="invite-card-copy">
                <strong>ลิงก์เชิญ</strong>
                <p>
                  ส่งลิงก์ให้ใครก็ได้ ผู้ที่เปิดลิงก์ต้องเข้าสู่ระบบด้วย Google แล้วส่งคำขอ
                  คุณอนุมัติก่อนจึงจะเข้าถึงโปรเจกต์ได้
                </p>
              </div>

              {!setupMissing && !link && (
                <button type="button" className="primary-button qx-small" onClick={createLink} disabled={linkBusy}>
                  <Link2 size={14} /> {linkBusy ? 'กำลังสร้าง...' : 'สร้างลิงก์เชิญ'}
                </button>
              )}
            </div>

            {setupMissing && (
              <p className="invite-card-warn">ยังใช้ลิงก์เชิญไม่ได้ ให้รัน SQL ชุดลิงก์เชิญใน Supabase ก่อน</p>
            )}

            {!setupMissing && link && (
              <>
                <div className="invite-card-row">
                  <input
                    className="invite-card-url"
                    readOnly
                    value={linkUrl}
                    onFocus={(event) => event.target.select()}
                  />
                  <button type="button" className="primary-button qx-small" onClick={handleCopy}>
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                  </button>
                </div>
                <div className="invite-card-actions">
                  <button type="button" className="invite-text-btn" onClick={createLink} disabled={linkBusy}>
                    สร้างลิงก์ใหม่
                  </button>
                  <span>·</span>
                  <button type="button" className="invite-text-btn danger" onClick={closeLink}>
                    ปิดลิงก์
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {isAdmin && requests.length > 0 && (
          <div className="join-requests">
            <h3>คำขอเข้าร่วม ({requests.length})</h3>
            {requests.map((req) => (
              <div className="join-request-row" key={req.id}>
                <div className="join-request-copy">
                  <strong>{req.email}</strong>
                  <small>{new Date(req.created_at).toLocaleString('th-TH')}</small>
                </div>
                <select
                  className="filter-select member-role-select"
                  aria-label={`บทบาทของ ${req.email}`}
                  value={roleFor[req.id] ?? 'viewer'}
                  onChange={(event) => setRoleFor((cur) => ({ ...cur, [req.id]: event.target.value }))}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
                <button type="button" className="primary-button qx-small" onClick={() => approve(req)}>
                  <Check size={14} /> อนุมัติ
                </button>
                <button type="button" className="secondary-button qx-small" onClick={() => reject(req)}>
                  <X size={14} /> ปฏิเสธ
                </button>
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <form className="members-invite" onSubmit={submit} style={{ marginTop: 16 }}>
            <div className="search-box members-email">
              <Mail size={16} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="หรือเชิญด้วยอีเมล Google โดยตรง"
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
            การเชิญด้วยอีเมลไม่ส่งอีเมลแจ้ง — ผู้ถูกเชิญต้องล็อกอินด้วยอีเมล Google นี้ จึงจะเห็นโปรเจกต์
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