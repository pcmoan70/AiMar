import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  filterLabel,
  sameValue,
  toggleAll,
  toggleValue,
  valueOptions,
  type FieldFilters,
  type FilterKey,
  type FilterValue,
  type LiceStatsMap,
} from '../lib/filters'
import type { Localities } from '../lib/localities'
import { numberLocale, useT } from '../lib/i18n'

interface Props {
  fieldKey: FilterKey
  localities: Localities
  anchor: DOMRect
  filters: FieldFilters
  /** The values of the site being viewed, marked for orientation. */
  siteValues: FilterValue[]
  stats?: LiceStatsMap
  onChange: (next: FieldFilters) => void
  onClose: () => void
}

/** Popover with a checkbox per value a register field takes (with site counts) and an All toggle. */
export default function FieldPicker({ fieldKey, localities, anchor, filters, siteValues, stats, onChange, onClose }: Props) {
  const t = useT()
  const [q, setQ] = useState('')
  const [byCount, setByCount] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 4 })
  const options = valueOptions(localities, fieldKey, stats)
  const numeric = options.length > 0 && typeof options[0].value !== 'string'
  const selected = (filters[fieldKey] as FilterValue[] | undefined) ?? []
  const query = q.trim().toLowerCase()
  const filtered = query ? options.filter((o) => o.label.toLowerCase().includes(query)) : options
  const shown = byCount && !numeric ? [...filtered].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)) : filtered
  const allSelected = options.length > 0 && options.every((o) => selected.some((s) => sameValue(s, o.value)))

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
    <div ref={root} className="picker" style={pos} role="group" aria-label={t('filter.values', { f: filterLabel(fieldKey) })}>
      <div className="picker-head">
        <span>
          {filterLabel(fieldKey)}
          {selected.length > 0 && <small className="muted"> · {selected.length}/{options.length}</small>}
        </span>
        <span className="picker-actions">
          {!numeric && (
            <button type="button" className="picker-any" onClick={() => setByCount(!byCount)} title={t(byCount ? 'filter.sortAZ' : 'filter.sortCount')}>
              {byCount ? '1–9' : 'A–Z'}
            </button>
          )}
          <button type="button" className={`picker-any${allSelected ? ' on' : ''}`} onClick={() => onChange(toggleAll(filters, fieldKey, options))}>
            {t('filter.all')}
          </button>
        </span>
      </div>
      {options.length > 12 && (
        <input type="search" placeholder={t('filter.searchValues')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label={t('filter.searchValues')} />
      )}
      <div className="picker-list">
        {shown.map((o) => {
          const active = selected.some((s) => sameValue(s, o.value))
          const mine = siteValues.some((v) => sameValue(v, o.value))
          return (
            <label key={o.label} className={`picker-item${active ? ' active' : ''}${mine ? ' mine' : ''}`} title={mine ? t('filter.thisSite') : undefined}>
              <input type="checkbox" checked={active} onChange={() => onChange(toggleValue(filters, fieldKey, o.value))} />
              <span>{o.label}</span>
              <small>{o.count.toLocaleString(numberLocale())}</small>
            </label>
          )
        })}
        {!shown.length && <p className="muted">{t('filter.noMatch')}</p>}
      </div>
    </div>,
    document.body,
  )
}
