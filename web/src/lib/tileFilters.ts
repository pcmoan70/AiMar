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
    applyFilter(filter, img.data)
    ctx.putImageData(img, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return { data: await blob.arrayBuffer() }
  })
}
