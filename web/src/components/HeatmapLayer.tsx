import { useEffect, useRef } from 'react'
import type { ImageSource, Map as MlMap } from 'maplibre-gl'
import { computeHeat, HEAT_MAX, MIN_PROD_WEEKS, paintHeat, setLastHeat, type FarmStat } from '../lib/heatmap'
import { toMerc } from '../lib/featureInfo'
import { useSettings } from '../lib/settings'

export const HEAT_LAYER_ID = 'treatment-heat'
export const LICE_HEAT_LAYER_ID = 'lice-heat'
/** Screen pixels per heat cell: keeps the grid small enough to recompute on every move. */
const CELL_PX = 4

interface Props {
  map: MlMap | null
  /** Overlay id: the image source painted, and the key for hover lookups. */
  id: string
  /** Kernel inputs (null while data is loading). */
  farms: FarmStat[] | null
  /** Colour-scale top and the minimum weighted denominator for a pixel to be painted. */
  max?: number
  minDen?: number
}

/** Headless component: recomputes a kernel-ratio heatmap into the map's image source on move and parameter change. */
export default function HeatmapLayer({ map, id, farms, max = HEAT_MAX, minDen = MIN_PROD_WEEKS }: Props) {
  const s = useSettings()
  const enabled = s.overlays.includes(id)
  const canvas = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!map || !enabled || !farms) {
      setLastHeat(id, null)
      return
    }
    const redraw = () => {
      const src = map.getSource(id) as ImageSource | undefined
      if (!src) return
      const b = map.getBounds()
      const [w, sth] = toMerc(b.getWest(), b.getSouth())
      const [e, n] = toMerc(b.getEast(), b.getNorth())
      const c = map.getContainer()
      const width = Math.max(8, Math.round(c.clientWidth / CELL_PX))
      const height = Math.max(8, Math.round(c.clientHeight / CELL_PX))
      const lat = map.getCenter().lat
      const radiusM = (s.heatRadiusKm * 1000) / Math.cos((lat * Math.PI) / 180)
      const grid = computeHeat(farms, [w, sth, e, n], width, height, radiusM, s.heatRadiusKm, minDen)
      paintHeat(grid, canvas.current, 0.75, max)
      setLastHeat(id, grid)
      src.updateImage({
        url: canvas.current.toDataURL('image/png'),
        coordinates: [
          [b.getWest(), b.getNorth()],
          [b.getEast(), b.getNorth()],
          [b.getEast(), b.getSouth()],
          [b.getWest(), b.getSouth()],
        ],
      })
    }
    const schedule = () => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(redraw, 120)
    }
    schedule()
    map.on('moveend', schedule)
    map.on('styledata', schedule)
    return () => {
      window.clearTimeout(timer.current)
      map.off('moveend', schedule)
      map.off('styledata', schedule)
    }
  }, [map, id, enabled, farms, max, minDen, s.heatRadiusKm])

  return null
}
