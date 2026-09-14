import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FILTER_LABELS, sameValue, valueOptions, type CapacityRange, type FilterKey } from '../lib/filters'
import type { Localities } from '../lib/localities'

interface Props {
  fieldKey: FilterKey
  localities: Localities
  anchor: DOMRect
  current: string | CapacityRange | undefined
  /** The value of the site being viewed, highlighted for orientation. */
  siteValue: string | CapacityRange | undefined
  onPick: (value: string | CapacityRange | undefined) => void
  onClose: () => void
}

/** Popover listing every value a register field takes, with site counts. */
export default function FieldPicker({ fieldKey, localities, anchor, current, siteValue, onPick, onClose }: Props) {
  const [q, setQ] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 4 })
  const options = valueOptions(localities, fieldKey)
  const query = q.trim().toLowerCase()
  const shown = query ? options.filter((o) => o.label.toLowerCase().includes(query)) : options

  useLayoutEffect(() => {
    const r = root.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.min(anchor.left, window.innerWidth - r.width - 8)
    const top = anchor.bottom + 4 + r.height > window.innerHeight - 8 ? Math.max(8, anchor.top - r.height - 4) : anchor.bottom + 4
    setPos({ left: Math.max(8, left), top })
  }, [anchor, shown.length])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', key)
    }
  }, [onClose])

  return createPortal(
    <div ref={root} className="picker" style={pos} role="listbox" aria-label={`${FILTER_LABELS[fieldKey]} values`}>
      <div className="picker-head">
        <span>{FILTER_LABELS[fieldKey]}</span>
        <button type="button" className="picker-any" onClick={() => onPick(undefined)} disabled={current === undefined}>
          Any
        </button>
      </div>
      {options.length > 12 && (
        <input type="search" placeholder="Search values" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search values" />
      )}
      <div className="picker-list">
        {shown.map((o) => {
          const active = sameValue(current, o.value)
          const mine = sameValue(siteValue, o.value)
          return (
            <button
              type="button"
              key={o.label}
              role="option"
              aria-selected={active}
              className={`picker-item${active ? ' active' : ''}${mine ? ' mine' : ''}`}
              onClick={() => onPick(o.value)}
              title={mine ? 'This site' : undefined}
            >
              <span>{o.label}</span>
              <small>{o.count.toLocaleString('en-GB')}</small>
            </button>
          )
        })}
        {!shown.length && <p className="muted">No match.</p>}
      </div>
    </div>,
    document.body,
  )
}
