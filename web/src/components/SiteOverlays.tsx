import { useEffect, useRef, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { enabledOverlays, fetchInfoRows, instantRows, type LookupRow } from '../lib/overlayLookup'
import { useSettings } from '../lib/settings'
import { useLang, useT } from '../lib/i18n'

interface Props {
  map: MlMap | null
  loknr: number
  lngLat: [number, number]
}

/** What every enabled overlay shows at this farm: the hover card's rows, asked at the site's position. */
export default function SiteOverlays({ map, loknr, lngLat }: Props) {
  const t = useT()
  const lang = useLang()
  const s = useSettings()
  const [rows, setRows] = useState<LookupRow[]>([])
  const abort = useRef<AbortController | null>(null)
  const overlays = s.overlays.join(',')

  useEffect(() => {
    if (!map) return
    let live = true
    const run = () => {
      const enabled = enabledOverlays(s).filter((l) => l.id !== 'localities')
      const instant = instantRows(map, lngLat, enabled, s, loknr)
      setRows(instant)
      abort.current?.abort()
      const queryable = enabled.filter((l) => l.info)
      if (!queryable.length) return
      const ctrl = new AbortController()
      abort.current = ctrl
      fetchInfoRows(map, lngLat, queryable, lang, ctrl.signal).then((got) => {
        if (live && !ctrl.signal.aborted) setRows((prev) => prev.map((r) => (got.has(r.id) ? { ...r, value: got.get(r.id) ?? null } : r)))
      })
    }
    run()
    // Tiles and grids arrive after the map settles, so ask again when it does.
    map.on('idle', run)
    return () => {
      live = false
      abort.current?.abort()
      map.off('idle', run)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loknr, lngLat[0], lngLat[1], overlays, s.climMonth, s.liceWeek, s.seasonWeek, s.weekAxis, s.weekHeatMode, s.heatRadiusKm, lang])

  return (
    <>
      <h3>{t('inspect.atSite')}</h3>
      {rows.length ? (
        <table className="kv site-overlays">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th>{r.title}</th>
                <td className={r.value ? '' : 'muted'}>{r.value === undefined ? '…' : r.value === null ? t('hover.nothing') : r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">{t('inspect.atSiteNone')}</p>
      )}
    </>
  )
}
