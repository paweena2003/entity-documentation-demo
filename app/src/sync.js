// 3-way merge สำหรับ autosave เมื่อมีคนแก้โปรเจกต์เดียวกันพร้อมกัน
// base = สถานะล่าสุดที่เราซิงก์กับเซิร์ฟเวอร์, local = สิ่งที่เราแก้, remote = สิ่งที่อยู่บนเซิร์ฟเวอร์ตอนนี้
// คืนค่า null ถ้ารวมอัตโนมัติไม่ได้ (แก้จุดเดียวกันต่างกัน)

const sortKeys = (v) => {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    return Object.keys(v)
      .sort()
      .reduce((o, k) => {
        o[k] = sortKeys(v[k])
        return o
      }, {})
  }
  return v
}

// stringify แบบเรียง key เพื่อเทียบค่า (jsonb ของ Postgres เรียง key ต่างจากฝั่งเรา)
export const stable = (value) => JSON.stringify(sortKeys(value))
const eq = (a, b) => stable(a) === stable(b)

const CONFLICT = Symbol('conflict')

const mergeScalar = (b, l, r) => {
  if (eq(l, b)) return r
  if (eq(r, b)) return l
  if (eq(l, r)) return l
  return CONFLICT
}

// รวม object หนึ่งตัวทีละ key (key ชื่อ fields จะรวมเป็นลิสต์ย่อยด้วย name)
function mergeObject(b, l, r) {
  const keys = new Set([...Object.keys(b ?? {}), ...Object.keys(l ?? {}), ...Object.keys(r ?? {})])
  const out = {}
  for (const k of keys) {
    if (k === 'fields') {
      const f = mergeList(b?.fields ?? [], l?.fields ?? [], r?.fields ?? [], (x) => x.name, null)
      if (!f) return null
      out.fields = f
      continue
    }
    const v = mergeScalar(b?.[k], l?.[k], r?.[k])
    if (v === CONFLICT) return null
    if (v !== undefined) out[k] = v
  }
  return out
}

function mergeList(base, local, remote, key, mergeItem = mergeObject) {
  const B = new Map(base.map((x) => [key(x), x]))
  const L = new Map(local.map((x) => [key(x), x]))
  const used = new Set()
  const result = []

  for (const r of remote) {
    const k = key(r)
    const b = B.get(k)
    const l = L.get(k)
    used.add(k)

    if (!L.has(k)) {
      if (b === undefined) result.push(r) // อีกฝั่งเพิ่มใหม่
      else if (!eq(r, b)) return null // เราลบ แต่อีกฝั่งแก้
      // else เราลบ อีกฝั่งไม่ได้แตะ → ลบ
      continue
    }

    if (b === undefined) {
      // เพิ่มชื่อ/ไอดีเดียวกันทั้งสองฝั่ง
      if (eq(l, r)) result.push(r)
      else return null
      continue
    }

    const lc = !eq(l, b)
    const rc = !eq(r, b)
    if (lc && rc) {
      if (eq(l, r)) result.push(r)
      else if (mergeItem) {
        const m = mergeItem(b, l, r)
        if (!m) return null
        result.push(m)
      } else return null
    } else if (lc) result.push(l)
    else result.push(r)
  }

  for (const l of local) {
    const k = key(l)
    if (used.has(k)) continue
    const b = B.get(k)
    if (b === undefined) result.push(l) // เราเพิ่มใหม่
    else if (!eq(l, b)) return null // เราแก้ แต่อีกฝั่งลบ
    // else อีกฝั่งลบ เราไม่ได้แตะ → ลบ
  }

  return result
}

export function mergeProject(base, local, remote) {
  const entities = mergeList(base.entities, local.entities, remote.entities, (e) => e.name)
  const relationships = mergeList(base.relationships, local.relationships, remote.relationships, (r) => r.id)
  const docs = mergeList(base.docs, local.docs, remote.docs, (d) => d.id)
  if (!entities || !relationships || !docs) return null

  const notes = mergeScalar(base.notes, local.notes, remote.notes)
  if (notes === CONFLICT) return null

  // changelog: รวมทั้งสองฝั่ง ไม่ซ้ำไอดี เรียงใหม่→เก่า
  const seen = new Set(remote.changelog.map((c) => c.id))
  const changelog = [...remote.changelog, ...local.changelog.filter((c) => !seen.has(c.id))]
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 500)

  return { entities, relationships, changelog, notes: notes ?? '', docs }
}
