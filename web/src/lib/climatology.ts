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
