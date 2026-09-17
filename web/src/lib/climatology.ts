// Monthly climatology overlays rendered by pipeline/climatology/render.py.
// Each PNG encodes one month of one field: R = mean index, G = p90 index, B = direction "to"
// (0…255 → 0…360°), A = steadiness (1…255 → 0…1); 0 in R means no data. The app decodes the
// pixels itself, so values can be shown on hover without a server.

export interface ClimLayer {
  title: string
  units: string
  min: number
  max: number
  scalar: boolean
  /** speed below which a sample counts as calm, in the field's units */
  calm: number
  width: number
  height: number
  /** [west, south, east, north] in degrees */
  bounds: [number, number, number, number]
  depths: number[] | null
  months: number[]
  files: Record<string, string>
}
export interface ClimManifest {
  attribution: string
  years: number[]
  created: string
  layers: Record<string, ClimLayer>
}

/** Registry ids map to fields in the manifest. */
export const CLIM_FIELDS: Record<string, string> = { 'clim-waves': 'waves', 'clim-wind': 'wind' }
export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export const climUrl = (file: string) => new URL(`${import.meta.env.BASE_URL}climatology/${file}`, location.href).href

export async function loadClimManifest(): Promise<ClimManifest | null> {
  try {
    const res = await fetch(climUrl('manifest.json'))
    return res.ok ? ((await res.json()) as ClimManifest) : null
  } catch {
    return null
  }
}

export interface ClimGrid {
  field: string
  month: number
  layer: ClimLayer
  /** raw RGBA of the encoded PNG */
  rgba: Uint8ClampedArray
}

const cache = new Map<string, Promise<ClimGrid | null>>()

/** Decodes one month of one field into its raw RGBA, cached per field+month. */
export function loadClimGrid(field: string, layer: ClimLayer, month: number): Promise<ClimGrid | null> {
  const key = `${field}|${month}`
  const hit = cache.get(key)
  if (hit) return hit
  const file = layer.files[`m${String(month).padStart(2, '0')}`]
  const job = !file
    ? Promise.resolve(null)
    : new Promise<ClimGrid | null>((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = layer.width
          c.height = layer.height
          const ctx = c.getContext('2d', { willReadFrequently: true })!
          ctx.drawImage(img, 0, 0)
          resolve({ field, month, layer, rgba: ctx.getImageData(0, 0, layer.width, layer.height).data })
        }
        img.onerror = () => resolve(null)
        img.src = climUrl(file)
      })
  cache.set(key, job)
  return job
}

const decode = (index: number, l: ClimLayer) => l.min + ((index - 1) / 254) * (l.max - l.min)

export interface ClimSample {
  mean: number
  p90: number
  /** direction the flow/wave travels towards, degrees from north (vector fields only) */
  direction: number | null
  /** 0…1: how consistently the direction points the same way */
  steadiness: number | null
}

/** Value at a position, or null outside the grid or where the model has no data. */
export function climAt(grid: ClimGrid, lon: number, lat: number): ClimSample | null {
  const [w, s, e, n] = grid.layer.bounds
  if (lon < w || lon > e || lat < s || lat > n) return null
  // The PNG is in Web Mercator, so rows follow the projected latitude, not the plain one.
  const merc = (d: number) => Math.log(Math.tan(Math.PI / 4 + (d * Math.PI) / 360))
  const col = Math.floor(((lon - w) / (e - w)) * grid.layer.width)
  const row = Math.floor(((merc(n) - merc(lat)) / (merc(n) - merc(s))) * grid.layer.height)
  if (col < 0 || row < 0 || col >= grid.layer.width || row >= grid.layer.height) return null
  const i = (row * grid.layer.width + col) * 4
  const r = grid.rgba[i]
  if (!r) return null
  const l = grid.layer
  return {
    mean: decode(r, l),
    p90: decode(grid.rgba[i + 1], l),
    direction: l.scalar ? null : (grid.rgba[i + 2] / 255) * 360,
    steadiness: l.scalar ? null : grid.rgba[i + 3] ? (grid.rgba[i + 3] - 1) / 254 : null,
  }
}

/** Sequential blue→yellow→red ramp for the mean value. */
export const CLIM_RAMP = ['#f2f7fb', '#cfe3f2', '#9dc9e8', '#6cb0d6', '#7fc08a', '#d8d55f', '#efa14a', '#e2632c', '#b8301c']

// The grid last painted per layer, so the hover card can read values without re-decoding.
const current = new Map<string, ClimGrid>()
export const setClimGrid = (id: string, g: ClimGrid | null) => (g ? current.set(id, g) : current.delete(id))
export const climGrid = (id: string) => current.get(id)

/** Direction arrows for a climatology layer live in their own source, refreshed as the map moves. */
export const climArrowSource = (id: string) => `${id}-arrows`

export interface ArrowSample {
  lon: number
  lat: number
  /** direction the waves or wind travel towards, degrees from north */
  dir: number
  mean: number
  p90: number
}

/**
 * Samples the grid on a regular lon/lat lattice inside `bounds`, for direction arrows.
 * `cols` sets how many arrows span the view, so the density follows the zoom.
 */
export const ARROW_COLS = 16

/** Lattice spacing in degrees latitude, i.e. the on-screen gap between arrows. */
function arrowStep(south: number, north: number, west: number, east: number, cols: number) {
  return ((east - west) / cols) * Math.cos((((north + south) / 2) * Math.PI) / 180)
}

export function climArrows(grid: ClimGrid, bounds: [number, number, number, number], cols = ARROW_COLS): { samples: ArrowSample[]; step: number } {
  const [w, s, e, n] = bounds
  const west = Math.max(w, grid.layer.bounds[0])
  const east = Math.min(e, grid.layer.bounds[2])
  const south = Math.max(s, grid.layer.bounds[1])
  const north = Math.min(n, grid.layer.bounds[3])
  if (east <= west || north <= south) return { samples: [], step: 0 }
  const stepLon = (east - west) / cols
  // Keep the lattice roughly square on screen at this latitude.
  const step = arrowStep(south, north, west, east, cols)
  const samples: ArrowSample[] = []
  for (let lat = south + step / 2; lat < north; lat += step)
    for (let lon = west + stepLon / 2; lon < east; lon += stepLon) {
      const v = climAt(grid, lon, lat)
      if (!v || v.direction == null) continue
      samples.push({ lon, lat, dir: v.direction, mean: v.mean, p90: v.p90 })
    }
  return { samples, step }
}

/** Degrees north/east for a bearing and an on-screen length given in degrees latitude. */
function offset(bearing: number, lat: number, len: number): [number, number] {
  const rad = (bearing * Math.PI) / 180
  return [(Math.sin(rad) * len) / Math.max(0.2, Math.cos((lat * Math.PI) / 180)), Math.cos(rad) * len]
}

/**
 * One barbed arrow per sample, drawn as a single line that runs out to the tip and
 * doubles back over each barb, so the head always sits at the end of the shaft.
 */
export function arrowGeoJSON(samples: ArrowSample[], lengthDeg: number) {
  const barb = lengthDeg * 0.32
  return {
    type: 'FeatureCollection' as const,
    features: samples.map((a) => {
      const [dLon, dLat] = offset(a.dir, a.lat, lengthDeg)
      const tail: [number, number] = [a.lon - dLon / 2, a.lat - dLat / 2]
      const tip: [number, number] = [a.lon + dLon / 2, a.lat + dLat / 2]
      const wing = (side: number): [number, number] => {
        const [bLon, bLat] = offset(a.dir + 180 + side * 30, a.lat, barb)
        return [tip[0] + bLon, tip[1] + bLat]
      }
      return {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: [tail, tip, wing(-1), tip, wing(1)] },
        properties: { dir: a.dir, mean: a.mean, p90: a.p90 },
      }
    }),
  }
}

export const MS_TO_KNOTS = 1.9438445

/** Half barbs, full barbs and pennants for a speed in knots, rounded to the nearest 5. */
export function barbCounts(knots: number): { pennants: number; full: number; half: number } {
  const k = Math.round(knots / 5) * 5
  const pennants = Math.floor(k / 50)
  const rest = k - pennants * 50
  return { pennants, full: Math.floor(rest / 10), half: rest % 10 >= 5 ? 1 : 0 }
}

/** Below this the station is drawn as a ring instead of a shaft, as on a weather chart. */
const CALM_KNOTS = 2.5

/**
 * Standard meteorological wind barbs. The shaft points into the wind, so it runs
 * the opposite way of the direction the wind travels, and the barbs at its far end
 * count the speed: a half barb is 5 knots, a full barb 10 and a pennant 50.
 * `speed` picks which statistic the barbs count; the colour of the map shows the mean.
 */
export function barbGeoJSON(samples: ArrowSample[], lengthDeg: number, speed: (a: ArrowSample) => number = (a) => a.mean) {
  return {
    type: 'FeatureCollection' as const,
    features: samples.map((a) => {
      const knots = speed(a) * MS_TO_KNOTS
      const lon = (d: number) => d / Math.max(0.2, Math.cos((a.lat * Math.PI) / 180))
      // Local frame: `along` runs up the shaft (into the wind), `across` is perpendicular.
      const rad = ((a.dir + 180) * Math.PI) / 180
      const at = (along: number, across: number): [number, number] => [
        a.lon + lon(Math.sin(rad) * along + Math.cos(rad) * across),
        a.lat + Math.cos(rad) * along - Math.sin(rad) * across,
      ]
      const lines: [number, number][][] = []
      if (knots < CALM_KNOTS) {
        const r = lengthDeg * 0.12
        lines.push(Array.from({ length: 17 }, (_, i) => at(r * Math.cos((i * Math.PI) / 8), r * Math.sin((i * Math.PI) / 8))))
      } else {
        lines.push([at(0, 0), at(lengthDeg, 0)])
        const { pennants, full, half } = barbCounts(knots)
        const gap = lengthDeg * 0.18
        // Barbs sweep back from the shaft at 120°, the angle a weather chart draws them at.
        const tip = (len: number): [number, number] => [Math.cos((120 * Math.PI) / 180) * len, Math.sin((120 * Math.PI) / 180) * len]
        const [backFull, outFull] = tip(lengthDeg * 0.38)
        // Barbs hang off the far end of the shaft and march back towards the station.
        let pos = lengthDeg
        for (let i = 0; i < pennants; i++) {
          lines.push([at(pos, 0), at(pos + backFull, outFull), at(pos - gap, 0), at(pos, 0)])
          pos -= gap * 1.6
        }
        for (let i = 0; i < full; i++) {
          lines.push([at(pos, 0), at(pos + backFull, outFull)])
          pos -= gap
        }
        // A lone half barb sits one place in from the tip, as on a weather chart.
        if (half) {
          if (!pennants && !full) pos -= gap
          lines.push([at(pos, 0), at(pos + backFull * 0.5, outFull * 0.5)])
        }
      }
      return {
        type: 'Feature' as const,
        geometry: { type: 'MultiLineString' as const, coordinates: lines },
        properties: { dir: a.dir, mean: a.mean, p90: a.p90, knots: Math.round(knots) },
      }
    }),
  }
}
