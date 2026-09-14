import { useEffect, useRef, useState } from 'react'
import { BASE_LAYERS } from '../lib/layers'
import { updateSettings, useSettings } from '../lib/settings'

/** Header dropdown for app-wide settings; currently the base map. */
export default function SettingsMenu() {
  const s = useSettings()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const base = BASE_LAYERS.find((l) => l.id === s.baseLayer) ?? BASE_LAYERS[0]

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="settings-menu" ref={root}>
      <button className={open ? 'active' : ''} onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open} title="Settings">
        ⚙ Settings
      </button>
      {open && (
        <div className="settings-pop" role="dialog" aria-label="Settings">
          <label>
            Base map
            <select value={s.baseLayer} onChange={(e) => updateSettings({ baseLayer: e.target.value })}>
              {BASE_LAYERS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
            <small>
              {base.organisation} · {base.license}
            </small>
          </label>
        </div>
      )}
    </div>
  )
}
