import { useEffect, useMemo, useRef } from 'react'
import type { ImageSource, Map as MlMap } from 'maplibre-gl'
import { computeHeat, farmTreatmentStats, paintHeat, setLastHeat } from '../lib/heatmap'
import { toMerc } from '../lib/featureInfo'
import type { FishHealth } from '../lib/fishhealth'
import type { Localities } from '../lib/localities'
import { useSettings } from '../lib/settings'

export const HEAT_LAYER_ID = 'treatment-heat'
/** Screen pixels per heat cell: keeps the grid small enough to recompute on every move. */
const CELL_PX = 4

interface Props {
  map: MlMap | null
  localities: Localities | null
  fishhealth: FishHealth | null
}

/** Headless component: recomputes the treatment heatmap into the map's image source on move and parameter change. */
export default function HeatmapLayer({ map, localities, fishhealth }: Props) {
  const s = useSettings()
  const enabled = s.overlays.includes(HEAT_LAYER_ID)
  const farms = useMemo(() => (localities && fishhealth ? farmTreatmentStats(fishhealth, localities) : null), [localities, fishhealth])
  const canvas = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!map || !enabled || !farms) {
      setLastHeat(null)
      return
    }
    const redraw = () => {
      const src = map.getSource(HEAT_LAYER_ID) as ImageSource | undefined
      if (!src) return
      const b = map.getBounds()
      const [w, sth] = toMerc(b.getWest(), b.getSouth())
      const [e, n] = toMerc(b.getEast(), b.getNorth())
      const c = map.getContainer()
      const width = Math.max(8, Math.round(c.clientWidth / CELL_PX))
      const height = Math.max(8, Math.round(c.clientHeight / CELL_PX))
      const lat = map.getCenter().lat
      const radiusM = (s.heatRadiusKm * 1000) / Math.cos((lat * Math.PI) / 180)
      const grid = computeHeat(farms, [w, sth, e, n], width, height, radiusM, s.heatRadiusKm)
      paintHeat(grid, canvas.current)
      setLastHeat(grid)
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
  }, [map, enabled, farms, s.heatRadiusKm])

  return null
}
