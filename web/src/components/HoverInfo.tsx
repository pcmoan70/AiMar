import { useEffect, useRef, useState } from 'react'
import type { Map as MlMap, MapMouseEvent } from 'maplibre-gl'
import { OVERLAY_LAYERS, layerById, type LayerDef } from '../lib/layers'
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
  value: string
}

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
      const enabled = OVERLAY_LAYERS.filter((l) => s.overlays.includes(l.id))
      const instant: Row[] = []

      // Vector layers: immediate
      if (s.overlays.includes('localities') && map.getLayer('localities')) {
        const f = map.queryRenderedFeatures(e.point, { layers: ['localities'] })[0]
        if (f) {
          const p = f.properties as LocalityProps
          instant.push({ id: 'localities', title: 'Locality', value: `${p.navn} (${p.loknr})${p.til_innehavere ? ` · ${p.til_innehavere}` : ''}` })
        }
      }
      if (!instant.length && s.overlays.includes('site-polygons') && map.getLayer('site-polygons')) {
        const f = map.queryRenderedFeatures(e.point, { layers: ['site-polygons'] })[0]
        if (f) instant.push({ id: 'site-polygons', title: 'Site border', value: `${f.properties.name ?? ''} (${f.properties.loknr})` })
      }

      // Density layers: sampled from decoded tiles
      const [mx, my] = toMerc(e.lngLat.lng, e.lngLat.lat)
      for (const l of enabled) {
        if (!l.tileFilter || !l.wmsLayers) continue
        const v = sampleDensity(l.wmsLayers, mx, my)
        if (v) instant.push({ id: l.id, title: shortTitle(l), value: v })
      }

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
          queryable.map(async (l): Promise<Row | null> => {
            const k = key(l)
            if (!cache.has(k)) {
              const url = infoUrl(l, [e.lngLat.lng, e.lngLat.lat], mpp)
              if (!url) return null
              try {
                const res = await fetch(url, { signal: ctrl.signal })
                cache.set(k, res.ok ? parseInfo(l.info!, await res.text()) : null)
              } catch {
                return null
              }
              if (cache.size > 2000) cache.delete(cache.keys().next().value!)
            }
            const v = cache.get(k)
            return v ? { id: l.id, title: shortTitle(l), value: v } : null
          }),
        )
        if (mine !== seq.current) return
        setRows((prev) => [...prev.filter((r) => !queryable.some((l) => l.id === r.id)), ...(results.filter(Boolean) as Row[])])
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
          <span className="hover-title">{layerById(r.id)?.category === 'aquaculture' ? r.title : r.title}</span>
          <span className="hover-value">{r.value}</span>
        </div>
      ))}
    </div>
  )
}
