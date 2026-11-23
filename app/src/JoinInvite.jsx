import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function JoinInvite({ code, onClose }) {
  const [info, setInfo] = useState(null) // { status, name }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase.rpc('preview_invite', { p_code: code }).then(({ data, error: err }) => {
      if (cancelled) return
      if (err) setError('ตรวจลิงก์ไม่สำเร็จ: ' + err.message)
      else setInfo(data)
    })
    return () => {
      cancelled = true
    }
  }, [code])

  const send = async () => {
    setBusy(true)
    setError('')
    const { data, error: err } = await supabase.rpc('request_join', { p_code: code })
    setBusy(false)
    if (err) {
      setError('ส่งคำขอไม่สำเร็จ: ' + err.message)
      return
    }
    setInfo((current) => ({ ...current, status: data?.status }))
  }

  const status = info?.status

  return (
    <div className="project-modal-overlay">
      <div className="project-modal">
        <div className="project-modal-header">
          <div>
            <h2>คำเชิญเข้าร่วมโปรเจกต์</h2>
            {status && status !== 'invalid' && info?.name && <p>{info.name}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="ปิด">
            ×
          </button>
        </div>

        {error && <div className="qx-error">{error}</div>}
        {!info && !error && <p>กำลังตรวจสอบลิงก์...</p>}

        {status === 'invalid' && (
          <p>ลิงก์นี้ไม่ถูกต้อง หรือ Admin ปิดลิงก์แล้ว กรุณาขอลิงก์ใหม่จากผู้เชิญ</p>
        )}
        {status === 'member' && <p>คุณเป็นสมาชิกของโปรเจกต์นี้อยู่แล้ว</p>}
        {status === 'pending' && (
          <p>ส่งคำขอแล้ว รอ Admin อนุมัติ เมื่ออนุมัติแล้วโปรเจกต์จะขึ้นในรายการของคุณ (รีเฟรชหน้าได้)</p>
        )}
        {status === 'none' && <p>ต้องการส่งคำขอเข้าร่วมโปรเจกต์นี้หรือไม่? Admin จะเป็นผู้อนุมัติ</p>}

        <div className="project-modal-actions">
          {status === 'none' ? (
            <>
              <button type="button" className="secondary-button" onClick={onClose}>
                ยกเลิก
              </button>
              <button type="button" className="primary-button" onClick={send} disabled={busy}>
                {busy ? 'กำลังส่ง...' : 'ส่งคำขอเข้าร่วม'}
              </button>
            </>
          ) : (
            <button type="button" className="primary-button" onClick={onClose}>
              ปิด
            </button>
          )}
        </div>
      </div>
    </div>
  )
}