import { useEffect, useRef } from 'react'
import type { ImageSource, Map as MlMap } from 'maplibre-gl'
import { CLIM_RAMP, loadClimGrid, setClimGrid, type ClimManifest } from '../lib/climatology'
import { useSettings } from '../lib/settings'

interface Props {
  map: MlMap | null
  /** Overlay id, e.g. clim-waves */
  id: string
  field: string
  manifest: ClimManifest | null
}

const ramp = CLIM_RAMP.map((hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const)

/** Headless: paints the chosen month of a climatology field into the map's image source. */
export default function ClimatologyLayer({ map, id, field, manifest }: Props) {
  const s = useSettings()
  const enabled = s.overlays.includes(id)
  const canvas = useRef<HTMLCanvasElement>(document.createElement('canvas'))

  useEffect(() => {
    const layer = manifest?.layers[field]
    if (!map || !enabled || !layer) {
      setClimGrid(id, null)
      return
    }
    let live = true
    loadClimGrid(field, layer, s.climMonth).then((grid) => {
      if (!live || !grid) return
      setClimGrid(id, grid)
      const src = map.getSource(id) as ImageSource | undefined
      if (!src) return
      // Colour the encoded mean through the ramp; alpha follows the value so calm water stays light.
      const c = canvas.current
      c.width = layer.width
      c.height = layer.height
      const ctx = c.getContext('2d')!
      const img = ctx.createImageData(layer.width, layer.height)
      for (let i = 0; i < grid.rgba.length; i += 4) {
        const idx = grid.rgba[i]
        if (!idx) continue
        const t = (idx - 1) / 254
        const k = Math.min(ramp.length - 1, Math.floor(t * ramp.length))
        img.data[i] = ramp[k][0]
        img.data[i + 1] = ramp[k][1]
        img.data[i + 2] = ramp[k][2]
        img.data[i + 3] = 200
      }
      ctx.putImageData(img, 0, 0)
      const [w, sth, e, n] = layer.bounds
      src.updateImage({
        url: c.toDataURL('image/png'),
        coordinates: [
          [w, n],
          [e, n],
          [e, sth],
          [w, sth],
        ],
      })
    })
    return () => {
      live = false
    }
  }, [map, id, field, manifest, enabled, s.climMonth])

  return null
}
