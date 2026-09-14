import { useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { operatorIndex, sitesOfOperators, type Localities } from '../lib/localities'
import { updateSettings, useSettings } from '../lib/settings'
import { numberLocale, useT } from '../lib/i18n'
import { siteColour } from '../lib/operatorColours'
import Hint from './Hint'

interface Props {
  localities: Localities | null
  map: MlMap | null
}

const fmt = (n: number) => n.toLocaleString(numberLocale(), { maximumFractionDigits: 0 })

/** Floating operator filter on the map: only sites of the chosen operators are shown. */
export default function OperatorDropdown({ localities, map }: Props) {
  const t = useT()
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
      ? t('ops.all')
      : s.operatorFilter.length === 1
        ? s.operatorFilter[0]
        : t('ops.n', { n: s.operatorFilter.length })

  return (
    <div className={`op-dropdown${open ? ' open' : ''}`} ref={root}>
      <button type="button" className="op-toggle" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        {s.operatorFilter.length === 1 && <span className="swatch" style={{ background: siteColour(s.operatorFilter[0], s.operatorFilter) }} />}
        <span className="op-label">{label}</span>
        {s.operatorFilter.length > 0 && <span className="op-count">{t('ops.sites', { n: matching.length })}</span>}
        <span className="op-caret">▾</span>
      </button>
      {open && (
        <div className="op-menu">
          <input
            type="search"
            placeholder={t('ops.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            aria-label={t('ops.searchAria')}
          />
          <div className="op-actions">
            <button type="button" className="secondary" onClick={zoomTo} disabled={!matching.length}>
              {t('ops.zoom')}
            </button>
            <button type="button" className="secondary" onClick={() => updateSettings({ operatorFilter: [] })} disabled={!s.operatorFilter.length}>
              {t('ops.showAll')}
            </button>
          </div>
          <div className="op-list" role="listbox" aria-multiselectable="true">
            {!localities && <p className="muted">{t('ops.loading')}</p>}
            {shown.map((o) => (
              <label key={o.name} className="row" role="option" aria-selected={selected.has(o.name)}>
                <input type="checkbox" checked={selected.has(o.name)} onChange={() => toggle(o.name)} />
                <Hint text={t('hint.operatorColours')}>
                  <span className="swatch" style={{ background: siteColour(o.name, s.operatorFilter) }} />
                </Hint>
                <span>
                  {o.name}
                  <small>
                    <Hint text={t('hint.operatorSites')}>
                      {t(o.sites === 1 ? 'ops.siteCount' : 'ops.siteCountPlural', { n: o.sites, t: fmt(o.capacityTn) })}
                    </Hint>
                  </small>
                </span>
              </label>
            ))}
            {query && !shown.length && <p className="muted">{t('ops.noMatch')}</p>}
            {!query && index.length > 30 && <p className="muted">{t('ops.largest', { n: index.length })}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
