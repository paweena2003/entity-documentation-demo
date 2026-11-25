import { useState } from 'react'
import { ChevronDown, Download } from 'lucide-react'

export default function ExportMenu({ items, disabled = false, label = 'Export' }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="notif-wrap">
      <button
        type="button"
        className="secondary-button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Download size={14} /> {label} <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className="workspace-backdrop" onClick={() => setOpen(false)} />
          <div className="workspace-dropdown export-menu">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                className="workspace-action"
                onClick={() => { setOpen(false); item.run() }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}