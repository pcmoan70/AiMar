// Per-pixel transparency for server-rendered density overlays. MapLibre cannot
// change raster alpha by colour, so tiles are fetched through a custom protocol,
// decoded, given an alpha that follows traffic intensity, and re-encoded.
import { addProtocol } from 'maplibre-gl'

export type TileFilter = 'ais-hue' | 'ais-white'

export const PROTOCOL = 'aisalpha'

/** Traffic rank 0..1 from a pixel colour, per palette family. */
export function rankOf(filter: TileFilter, r: number, g: number, b: number): number {
  if (filter === 'ais-white') {
    // White→orange→red gradient: distance from white.
    return Math.min(1, (1 - Math.min(r, g, b) / 255) * 1.4)
  }
  // Blue → green → yellow → red classes: rank by hue.
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (max === 0 || d / max < 0.2) return 0.2
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = (h * 60 + 360) % 360
  if (h > 300) return 1
  return Math.min(1, Math.max(0, (240 - h) / 240))
}

/** Output alpha for a pixel given its original alpha and rank. */
export const alphaOf = (a: number, rank: number) => Math.round(a * (0.08 + 0.92 * rank ** 1.6))

export function applyFilter(filter: TileFilter, data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a === 0) continue
    data[i + 3] = alphaOf(a, rankOf(filter, data[i], data[i + 1], data[i + 2]))
  }
}

/** Tile URL that routes through the filter protocol; placeholders stay intact for MapLibre. */
export const filteredTileUrl = (filter: TileFilter, url: string) => `${PROTOCOL}://${filter}/${url}`

// ---- decoded-tile cache for hover sampling (density layers are not queryable server-side)
interface CachedTile {
  layers: string
  bbox: [number, number, number, number]
  width: number
  height: number
  data: Uint8ClampedArray
  filter: TileFilter
}
const tileCache = new Map<string, CachedTile>()
const TILE_CACHE_MAX = 400

function remember(url: string, filter: TileFilter, width: number, height: number, data: Uint8ClampedArray) {
  const u = new URL(url)
  const bbox = (u.searchParams.get('bbox') ?? '').split(',').map(Number)
  const layers = u.searchParams.get('layers') ?? ''
  if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) return
  if (tileCache.size >= TILE_CACHE_MAX) tileCache.delete(tileCache.keys().next().value!)
  tileCache.set(url, { layers, bbox: bbox as [number, number, number, number], width, height, data, filter })
}

/** Traffic rank (0–4) under a Web-Mercator point for the given WMS layer name, 'none' for no traffic, undefined when no tile is loaded. */
export function sampleDensity(wmsLayers: string, mercX: number, mercY: number): number | 'none' | undefined {
  let best: CachedTile | undefined
  for (const t of tileCache.values()) {
    if (t.layers !== wmsLayers) continue
    const [x0, y0, x1, y1] = t.bbox
    if (mercX < x0 || mercX >= x1 || mercY < y0 || mercY >= y1) continue
    if (!best || x1 - x0 < best.bbox[2] - best.bbox[0]) best = t
  }
  if (!best) return undefined
  const [x0, y0, x1, y1] = best.bbox
  const px = Math.floor(((mercX - x0) / (x1 - x0)) * best.width)
  const py = Math.floor(((y1 - mercY) / (y1 - y0)) * best.height)
  const i = (py * best.width + px) * 4
  const [r, g, b, a] = [best.data[i], best.data[i + 1], best.data[i + 2], best.data[i + 3]]
  if (a === 0) return 'none'
  return Math.min(4, Math.floor(rankOf(best.filter, r, g, b) * 5))
}

/**
 * Highest traffic rank within `radius` (Web-Mercator units) of a point: a farm cares about the
 * busiest lane nearby, not the one pixel under the cursor. Reads the finest tiles loaded.
 */
export function sampleDensityMax(wmsLayers: string, mercX: number, mercY: number, radius: number): number | 'none' | undefined {
  const hits = [...tileCache.values()].filter((t) => {
    if (t.layers !== wmsLayers) return false
    const [x0, y0, x1, y1] = t.bbox
    return mercX + radius >= x0 && mercX - radius < x1 && mercY + radius >= y0 && mercY - radius < y1
  })
  if (!hits.length) return undefined
  const finest = Math.min(...hits.map((t) => t.bbox[2] - t.bbox[0]))
  let best = -1
  let seen = false
  for (const t of hits) {
    const [x0, y0, x1, y1] = t.bbox
    if (x1 - x0 !== finest) continue
    const sx = t.width / (x1 - x0)
    const sy = t.height / (y1 - y0)
    const px0 = Math.max(0, Math.floor((mercX - radius - x0) * sx))
    const px1 = Math.min(t.width - 1, Math.ceil((mercX + radius - x0) * sx))
    const py0 = Math.max(0, Math.floor((y1 - (mercY + radius)) * sy))
    const py1 = Math.min(t.height - 1, Math.ceil((y1 - (mercY - radius)) * sy))
    for (let py = py0; py <= py1; py++)
      for (let px = px0; px <= px1; px++) {
        const dx = x0 + (px + 0.5) / sx - mercX
        const dy = y1 - (py + 0.5) / sy - mercY
        if (dx * dx + dy * dy > radius * radius) continue
        seen = true
        const i = (py * t.width + px) * 4
        if (t.data[i + 3] === 0) continue
        best = Math.max(best, Math.min(4, Math.floor(rankOf(t.filter, t.data[i], t.data[i + 1], t.data[i + 2]) * 5)))
      }
  }
  if (!seen) return undefined
  return best < 0 ? 'none' : best
}

export function registerTileFilters(): void {
  addProtocol(PROTOCOL, async (params, abort) => {
    const rest = params.url.slice(PROTOCOL.length + 3)
    const slash = rest.indexOf('/')
    const filter = rest.slice(0, slash) as TileFilter
    const res = await fetch(rest.slice(slash + 1), { signal: abort.signal })
    if (!res.ok) throw new Error(`tile ${res.status}`)
    const bitmap = await createImageBitmap(await res.blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    remember(rest.slice(slash + 1), filter, bitmap.width, bitmap.height, new Uint8ClampedArray(img.data))
    applyFilter(filter, img.data)
    ctx.putImageData(img, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return { data: await blob.arrayBuffer() }
  })
}
