import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const forgetCode = () => {
    try {
        localStorage.removeItem('ep_join')
    } catch {
        /* ignore */
    }
}

export default function JoinInvite({ code, onClose, onApproved }) {
    const [info, setInfo] = useState(null) // { status, name }
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [approved, setApproved] = useState(false)
    const prevStatus = useRef(null)

    const check = async () => {
        const { data, error: err } = await supabase.rpc('preview_invite', { p_code: code })
        if (err) {
            setError('ตรวจลิงก์ไม่สำเร็จ: ' + err.message)
            return
        }
        setError('')
        setInfo(data)
    }

    useEffect(() => {
        check().then(forgetCode) // แสดงผลครั้งเดียว แล้วล้างรหัสที่ค้างในเครื่อง
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code])

    const status = info?.status

    // รอ Admin อนุมัติ: ตรวจซ้ำเป็นระยะ
    useEffect(() => {
        if (status !== 'pending') return
        const timer = setInterval(check, 4000)
        return () => clearInterval(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, code])

    // เปลี่ยนสถานะ: เคลียร์รหัสที่ค้าง / แจ้งว่าอนุมัติแล้ว
    useEffect(() => {
        if (!status) return
        if (status === 'member' || status === 'invalid') forgetCode()
        if (status === 'member' && prevStatus.current === 'pending') {
            setApproved(true)
            onApproved?.()
        }
        prevStatus.current = status
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status])

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

    const close = () => {
        forgetCode()
        onClose()
    }

    return (
        <div className="project-modal-overlay">
            <div className="project-modal">
                <div className="project-modal-header">
                    <div>
                        <h2>คำเชิญเข้าร่วมโปรเจกต์</h2>
                        {status && status !== 'invalid' && info?.name && <p>{info.name}</p>}
                    </div>
                    <button type="button" className="icon-button" onClick={close} aria-label="ปิด">
                        ×
                    </button>
                </div>

                {error && <div className="qx-error">{error}</div>}
                {!info && !error && <p>กำลังตรวจสอบลิงก์...</p>}

                {status === 'invalid' && (
                    <p>ลิงก์นี้ไม่ถูกต้อง หรือ Admin ปิดลิงก์แล้ว กรุณาขอลิงก์ใหม่จากผู้เชิญ</p>
                )}
                {status === 'member' && (
                    <p>
                        {approved
                            ? 'Admin อนุมัติแล้ว โปรเจกต์นี้อยู่ในรายการของคุณเรียบร้อย'
                            : 'คุณเป็นสมาชิกของโปรเจกต์นี้อยู่แล้ว'}
                    </p>
                )}
                {status === 'pending' && <p>ส่งคำขอแล้ว รอ Admin อนุมัติ เมื่ออนุมัติหน้านี้จะอัปเดตให้เอง</p>}
                {status === 'none' && <p>ต้องการส่งคำขอเข้าร่วมโปรเจกต์นี้หรือไม่? Admin จะเป็นผู้อนุมัติ</p>}

                <div className="project-modal-actions">
                    {status === 'none' ? (
                        <>
                            <button type="button" className="secondary-button" onClick={close}>
                                ยกเลิก
                            </button>
                            <button type="button" className="primary-button" onClick={send} disabled={busy}>
                                {busy ? 'กำลังส่ง...' : 'ส่งคำขอเข้าร่วม'}
                            </button>
                        </>
                    ) : (
                        <button type="button" className="primary-button" onClick={close}>
                            {approved ? 'ไปที่โปรเจกต์' : 'ปิด'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}