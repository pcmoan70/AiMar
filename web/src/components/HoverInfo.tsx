import { useEffect, useRef, useState } from 'react'
import type { Map as MlMap, MapMouseEvent } from 'maplibre-gl'
import { CATEGORIES, overlaysIn, type LayerDef } from '../lib/layers'
import { infoUrl, parseInfo, toMerc } from '../lib/featureInfo'
import { sampleDensity } from '../lib/tileFilters'
import { getSettings } from '../lib/settings'
import type { LocalityProps } from '../lib/localities'

interface Props {
  map: MlMap | null
}

interface Row {
  id: string
  title: string
  /** null = nothing at this point, undefined = still loading */
  value: string | null | undefined
}

const NO_LOOKUP = 'no point lookup available'

const DEBOUNCE_MS = 250
const cache = new Map<string, string | null>()

const shortTitle = (l: LayerDef) => l.title.replace(/\s*\([^)]*\)\s*$/, '')

/** Card that follows the pointer and lists what each enabled overlay shows under it. */
export default function HoverInfo({ map }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const timer = useRef<number | undefined>(undefined)
  const abort = useRef<AbortController | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    if (!map) return
    const onMove = (e: MapMouseEvent) => {
      const s = getSettings()
      // Every enabled overlay, in tab order, gets a row
      const enabled = CATEGORIES.flatMap((c) => overlaysIn(c.id)).filter((l) => s.overlays.includes(l.id))
      const [mx, my] = toMerc(e.lngLat.lng, e.lngLat.lat)
      const instant: Row[] = enabled.map((l) => {
        if (l.id === 'localities') {
          const f = map.getLayer('localities') ? map.queryRenderedFeatures(e.point, { layers: ['localities'] })[0] : undefined
          const p = f?.properties as LocalityProps | undefined
          return { id: l.id, title: 'Locality', value: p ? `${p.navn} (${p.loknr})${p.til_innehavere ? ` · ${p.til_innehavere}` : ''}` : null }
        }
        if (l.id === 'site-polygons') {
          const f = map.getLayer('site-polygons') ? map.queryRenderedFeatures(e.point, { layers: ['site-polygons'] })[0] : undefined
          return { id: l.id, title: 'Site border', value: f ? `${f.properties.name ?? ''} (${f.properties.loknr})` : null }
        }
        if (l.tileFilter && l.wmsLayers) return { id: l.id, title: shortTitle(l), value: sampleDensity(l.wmsLayers, mx, my) ?? null }
        if (l.info) return { id: l.id, title: shortTitle(l), value: undefined }
        return { id: l.id, title: shortTitle(l), value: NO_LOOKUP }
      })

      setPos({ x: e.point.x, y: e.point.y })
      setRows(instant)

      // WMS layers: debounced GetFeatureInfo
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
        const key = (l: LayerDef) => `${l.id}|${e.lngLat.lng.toFixed(4)}|${e.lngLat.lat.toFixed(4)}|${Math.round(map.getZoom())}`
        const results = await Promise.all(
          queryable.map(async (l): Promise<[string, string | null]> => {
            const k = key(l)
            if (!cache.has(k)) {
              const url = infoUrl(l, [e.lngLat.lng, e.lngLat.lat], mpp)
              if (!url) return [l.id, null]
              try {
                const res = await fetch(url, { signal: ctrl.signal })
                cache.set(k, res.ok ? parseInfo(l.info!, await res.text()) : null)
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
  }, [map])

  if (!pos || !rows.length) return null
  const flipX = pos.x > (map?.getContainer().clientWidth ?? 0) - 280
  return (
    <div className="hover-card" style={{ left: pos.x + (flipX ? -16 : 16), top: pos.y + 16, transform: flipX ? 'translateX(-100%)' : undefined }}>
      {rows.map((r) => (
        <div key={r.id} className="hover-row">
          <span className="hover-title">{r.title}</span>
          <span className={`hover-value${r.value ? '' : ' muted'}`}>
            {r.value === undefined ? '…' : r.value === null ? '– nothing here' : r.value}
          </span>
        </div>
      ))}
    </div>
  )
}
