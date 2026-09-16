import { useEffect, useRef, useState } from 'react'
import type { Map as MlMap, MapMouseEvent } from 'maplibre-gl'
import { CATEGORIES, overlaysIn, type LayerDef } from '../lib/layers'
import { infoUrl, parseInfo, toMerc } from '../lib/featureInfo'
import { sampleDensity } from '../lib/tileFilters'
import { heatValueAt } from '../lib/heatmap'
import { liceWeekValue } from '../lib/liceWeek'
import { climAt, climGrid, CLIM_FIELDS } from '../lib/climatology'
import { getSettings } from '../lib/settings'
import type { LocalityProps } from '../lib/localities'
import { t, useLang } from '../lib/i18n'

interface Props {
  map: MlMap | null
}

interface Row {
  id: string
  title: string
  /** null = nothing at this point, undefined = still loading */
  value: string | null | undefined
}

const DEBOUNCE_MS = 250
const cache = new Map<string, string | null>()

const shortTitle = (l: LayerDef) => t(`layer.${l.id}.title`).replace(/\s*\([^)]*\)\s*$/, '')

/** Card that follows the pointer and lists what each enabled overlay shows under it. */
export default function HoverInfo({ map }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const timer = useRef<number | undefined>(undefined)
  const abort = useRef<AbortController | null>(null)
  const seq = useRef(0)
  const lang = useLang()

  useEffect(() => {
    if (!map) return
    const onMove = (e: MapMouseEvent) => {
      const s = getSettings()
      const enabled = CATEGORIES.flatMap((c) => overlaysIn(c.id)).filter((l) => s.overlays.includes(l.id))
      const [mx, my] = toMerc(e.lngLat.lng, e.lngLat.lat)
      const instant: Row[] = enabled.map((l) => {
        if (l.id === 'localities') {
          const f = map.getLayer('localities') ? map.queryRenderedFeatures(e.point, { layers: ['localities'] })[0] : undefined
          const p = f?.properties as LocalityProps | undefined
          return { id: l.id, title: t('hover.locality'), value: p ? `${p.navn} (${p.loknr})${p.til_innehavere ? ` · ${p.til_innehavere}` : ''}` : null }
        }
        if (l.id === 'applications') {
          const f = map.getLayer('applications') ? map.queryRenderedFeatures(e.point, { layers: ['applications'] })[0] : undefined
          const a = f?.properties as { navn?: string; appNo?: string; applicant?: string; biomass?: number } | undefined
          return {
            id: l.id,
            title: shortTitle(l),
            value: a ? `${a.navn ?? a.appNo} · ${a.applicant ?? ''}${a.biomass ? ` · ${a.biomass} t` : ''}` : null,
          }
        }
        if (l.id === 'deleted-sites') {
          const f = map.getLayer('deleted-sites') ? map.queryRenderedFeatures(e.point, { layers: ['deleted-sites'] })[0] : undefined
          const p = f?.properties as LocalityProps | undefined
          return { id: l.id, title: shortTitle(l), value: p ? `${p.navn} (${p.loknr})${p.klareringsdato ? ` · ${t('inspect.clearedShort')} ${String(p.klareringsdato).slice(0, 4)}` : ''}` : null }
        }
        if (l.id === 'site-polygons') {
          const f = map.getLayer('site-polygons') ? map.queryRenderedFeatures(e.point, { layers: ['site-polygons'] })[0] : undefined
          return { id: l.id, title: t('hover.border'), value: f ? `${f.properties.name ?? ''} (${f.properties.loknr})` : null }
        }
        if (CLIM_FIELDS[l.id]) {
          const g = climGrid(l.id)
          const v = g && climAt(g, e.lngLat.lng, e.lngLat.lat)
          return {
            id: l.id,
            title: shortTitle(l),
            value: v
              ? t('clim.hover', {
                  mean: v.mean.toFixed(1),
                  p90: v.p90.toFixed(1),
                  u: g!.layer.units,
                  dir: v.direction == null ? '–' : `${Math.round(v.direction)}°`,
                  steady: v.steadiness == null ? '–' : `${Math.round(v.steadiness * 100)} %`,
                })
              : null,
          }
        }
        if (l.id === 'treatment-heat') {
          const h = heatValueAt(l.id, mx, my)
          return { id: l.id, title: shortTitle(l), value: h ? t('heat.hover', { p: (h.value * 100).toFixed(1), r: h.radiusKm }) : null }
        }
        if (l.id === 'lice-heat') {
          const h = heatValueAt(l.id, mx, my)
          const mode = s.weekHeatMode
          return {
            id: l.id,
            title: t(`weekHeat.title.${mode}`),
            value: h ? t(`weekHeat.hover.${mode}`, { v: mode === 'treatment' ? Math.round(h.value * 100) : h.value.toFixed(2), r: h.radiusKm }) : null,
          }
        }
        if (l.id === 'lice-week') {
          const f = map.getLayer('localities') ? map.queryRenderedFeatures(e.point, { layers: ['localities'] })[0] : undefined
          const nr = (f?.properties as LocalityProps | undefined)?.loknr
          const v = nr === undefined ? undefined : liceWeekValue(nr)
          return { id: l.id, title: shortTitle(l), value: nr === undefined ? null : v == null ? t('liceWeek.notReported') : t('liceWeek.hover', { v: v.toFixed(2) }) }
        }
        if (l.tileFilter && l.wmsLayers) {
          const d = sampleDensity(l.wmsLayers, mx, my)
          return { id: l.id, title: shortTitle(l), value: d === undefined ? null : d === 'none' ? t('hover.noTraffic') : t(`hover.traffic.${d}`) }
        }
        if (l.info) return { id: l.id, title: shortTitle(l), value: undefined }
        return { id: l.id, title: shortTitle(l), value: t('hover.noLookup') }
      })

      setPos({ x: e.point.x, y: e.point.y })
      setRows(instant)

      window.clearTimeout(timer.current)
      abort.current?.abort()
      const queryable = enabled.filter((l) => l.info)
      if (!queryable.length) return
      const mine = ++seq.current
      timer.current = window.setTimeout(async () => {
        const ctrl = new AbortController()
        abort.current = ctrl
        const lat = e.lngLat.lat
        const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 256 / 2 ** map.getZoom()
        const key = (l: LayerDef) => `${lang}|${l.id}|${e.lngLat.lng.toFixed(4)}|${e.lngLat.lat.toFixed(4)}|${Math.round(map.getZoom())}`
        const results = await Promise.all(
          queryable.map(async (l): Promise<[string, string | null]> => {
            const k = key(l)
            if (!cache.has(k)) {
              const url = infoUrl(l, [e.lngLat.lng, e.lngLat.lat], mpp)
              if (!url) return [l.id, null]
              try {
                const res = await fetch(url, { signal: ctrl.signal })
                cache.set(k, res.ok ? parseInfo(l.info!, await res.text(), l.id) : null)
              } catch {
                return [l.id, null]
              }
              if (cache.size > 2000) cache.delete(cache.keys().next().value!)
            }
            return [l.id, cache.get(k) ?? null]
          }),
        )
        if (mine !== seq.current) return
        const got = new Map(results)
        setRows((prev) => prev.map((r) => (got.has(r.id) ? { ...r, value: got.get(r.id) ?? null } : r)))
      }, DEBOUNCE_MS)
    }
    const onLeave = () => {
      window.clearTimeout(timer.current)
      abort.current?.abort()
      setPos(null)
      setRows([])
    }
    map.on('mousemove', onMove)
    map.getCanvas().addEventListener('mouseleave', onLeave)
    return () => {
      map.off('mousemove', onMove)
      map.getCanvas().removeEventListener('mouseleave', onLeave)
      onLeave()
    }
  }, [map, lang])

  if (!pos || !rows.length) return null
  const flipX = pos.x > (map?.getContainer().clientWidth ?? 0) - 280
  return (
    <div className="hover-card" style={{ left: pos.x + (flipX ? -16 : 16), top: pos.y + 16, transform: flipX ? 'translateX(-100%)' : undefined }}>
      {rows.map((r) => (
        <div key={r.id} className="hover-row">
          <span className="hover-title">{r.title}</span>
          <span className={`hover-value${r.value ? '' : ' muted'}`}>
            {r.value === undefined ? '…' : r.value === null ? t('hover.nothing') : r.value}
          </span>
        </div>
      ))}
    </div>
  )
}
