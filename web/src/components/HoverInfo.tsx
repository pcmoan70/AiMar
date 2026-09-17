import { useEffect, useRef, useState } from 'react'
import type { Map as MlMap, MapMouseEvent } from 'maplibre-gl'
import { enabledOverlays, fetchInfoRows, instantRows, type LookupRow } from '../lib/overlayLookup'
import { getSettings } from '../lib/settings'
import { t, useLang } from '../lib/i18n'

interface Props {
  map: MlMap | null
}

const DEBOUNCE_MS = 250

/** Card that follows the pointer and lists what each enabled overlay shows under it. */
export default function HoverInfo({ map }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [rows, setRows] = useState<LookupRow[]>([])
  const timer = useRef<number | undefined>(undefined)
  const abort = useRef<AbortController | null>(null)
  const seq = useRef(0)
  const lang = useLang()

  useEffect(() => {
    if (!map) return
    const onMove = (e: MapMouseEvent) => {
      const s = getSettings()
      const enabled = enabledOverlays(s)
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      setPos({ x: e.point.x, y: e.point.y })
      setRows(instantRows(map, lngLat, enabled, s))

      window.clearTimeout(timer.current)
      abort.current?.abort()
      const queryable = enabled.filter((l) => l.info)
      if (!queryable.length) return
      const mine = ++seq.current
      timer.current = window.setTimeout(async () => {
        const ctrl = new AbortController()
        abort.current = ctrl
        const got = await fetchInfoRows(map, lngLat, queryable, lang, ctrl.signal)
        if (mine !== seq.current) return
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
