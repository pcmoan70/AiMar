import { useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { operatorIndex, sitesOfOperators, type Localities } from '../lib/localities'
import { updateSettings, useSettings } from '../lib/settings'

interface Props {
  localities: Localities | null
  map: MlMap | null
}

const fmt = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 })

/** Floating operator filter on the map: only sites of the chosen operators are shown. */
export default function OperatorDropdown({ localities, map }: Props) {
  const s = useSettings()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const index = useMemo(() => (localities ? operatorIndex(localities) : []), [localities])
  const selected = new Set(s.operatorFilter)
  const query = q.trim().toLowerCase()
  const shown = query
    ? index.filter((o) => o.name.toLowerCase().includes(query))
    : index.filter((o, i) => selected.has(o.name) || i < 30)
  const matching = localities ? sitesOfOperators(localities, s.operatorFilter) : []

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const toggle = (name: string) =>
    updateSettings({
      operatorFilter: selected.has(name) ? s.operatorFilter.filter((x) => x !== name) : [...s.operatorFilter, name],
    })

  const zoomTo = () => {
    if (!map || !localities || !matching.length) return
    const ids = new Set(matching)
    let w = 180
    let south = 90
    let e = -180
    let n = -90
    for (const f of localities.features) {
      if (!ids.has(f.properties.loknr)) continue
      const [x, y] = f.geometry.coordinates
      w = Math.min(w, x)
      e = Math.max(e, x)
      south = Math.min(south, y)
      n = Math.max(n, y)
    }
    map.fitBounds([[w, south], [e, n]], { padding: 60, maxZoom: 11, duration: 800 })
  }

  const label =
    s.operatorFilter.length === 0
      ? 'All operators'
      : s.operatorFilter.length === 1
        ? s.operatorFilter[0]
        : `${s.operatorFilter.length} operators`

  return (
    <div className={`op-dropdown${open ? ' open' : ''}`} ref={root}>
      <button type="button" className="op-toggle" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="op-label">{label}</span>
        {s.operatorFilter.length > 0 && <span className="op-count">{matching.length} sites</span>}
        <span className="op-caret">▾</span>
      </button>
      {open && (
        <div className="op-menu">
          <input
            type="search"
            placeholder="Search operator"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            aria-label="Search operators"
          />
          {s.operatorFilter.length > 0 && (
            <div className="op-actions">
              <button type="button" className="secondary" onClick={zoomTo} disabled={!matching.length}>
                Zoom to sites
              </button>
              <button type="button" className="secondary" onClick={() => updateSettings({ operatorFilter: [] })}>
                Show all
              </button>
            </div>
          )}
          <div className="op-list" role="listbox" aria-multiselectable="true">
            {!localities && <p className="muted">Loading…</p>}
            {shown.map((o) => (
              <label key={o.name} className="row" role="option" aria-selected={selected.has(o.name)}>
                <input type="checkbox" checked={selected.has(o.name)} onChange={() => toggle(o.name)} />
                <span>
                  {o.name}
                  <small>
                    {o.sites} site{o.sites === 1 ? '' : 's'} · {fmt(o.capacityTn)} t
                  </small>
                </span>
              </label>
            ))}
            {query && !shown.length && <p className="muted">No operator matches.</p>}
            {!query && index.length > 30 && (
              <p className="muted">
                30 largest of {index.length} operators; type to search.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
