// Treatment-intensity heatmap: for every pixel, the kernel-weighted share of
// production weeks that carried a lice treatment, over farms within R km.
//
//   value(x) = Σ_i K(d_i) · treat_i  /  Σ_i K(d_i) · prod_i
//
// prod_i  = weeks with a lice report (farm operating) in the window
// treat_i = weeks flagged mechanical removal or medicinal treatment
// K(d)    = max(0, 1 − (d/R)²)   (bounded quadratic kernel, d = distance)
// Pixels with fewer than MIN_PROD_WEEKS kernel-weighted production weeks are left transparent.
import { FLAG, type FishHealth } from './fishhealth'
import { toMerc } from './featureInfo'
import type { Localities } from './localities'

export const HEAT_WEEKS = 4 * 52
export const MIN_PROD_WEEKS = 26
export const HEAT_RADII_KM = [5, 10, 20, 30, 50]
/** Colour scale top: 30 % of production weeks with treatment (95th percentile of farms is ~25 %). */
export const HEAT_MAX = 0.3
/** One-hue sequential ramp, light → dark (dataviz reference orange ramp). */
export const HEAT_RAMP = ['#fde8d5', '#fbd0ad', '#f6b280', '#ee9156', '#e46e34', '#c9531f', '#a63d13', '#7f2c0c']

export interface FarmStat {
  x: number
  y: number
  prod: number
  treat: number
}

/** Production and treatment weeks per farm over the last `weeks` of the snapshot, in Web-Mercator metres. */
export function farmTreatmentStats(data: FishHealth, localities: Localities, weeks = HEAT_WEEKS): FarmStat[] {
  const out: FarmStat[] = []
  for (const f of localities.features) {
    const d = data.localities[String(f.properties.loknr)]
    if (!d) continue
    const l = d.l.slice(-weeks)
    const fl = d.f.slice(-weeks)
    let prod = 0
    let treat = 0
    for (let i = 0; i < l.length; i++) {
      if (l[i] == null) continue
      prod++
      if (fl[i] & (FLAG.mechanical | FLAG.substance)) treat++
    }
    if (!prod) continue
    const [x, y] = toMerc(f.geometry.coordinates[0], f.geometry.coordinates[1])
    out.push({ x, y, prod, treat })
  }
  return out
}

export interface HeatGrid {
  /** Web-Mercator bounds [west, south, east, north] */
  bounds: [number, number, number, number]
  width: number
  height: number
  /** Row 0 = north. NaN = not enough production weeks nearby. */
  values: Float32Array
  radiusKm: number
}

/** Compute the ratio grid. `radiusM` is the kernel radius in Mercator metres (R km scaled by 1/cos(lat));
 *  pixels whose weighted denominator is below `minDen` stay transparent. */
export function computeHeat(farms: FarmStat[], bounds: [number, number, number, number], width: number, height: number, radiusM: number, radiusKm: number, minDen = MIN_PROD_WEEKS): HeatGrid {
  const [w, s, e, n] = bounds
  const values = new Float32Array(width * height).fill(NaN)
  // Spatial hash with cell = radius so each pixel checks 3×3 buckets
  const cell = radiusM
  const buckets = new Map<string, FarmStat[]>()
  const key = (bx: number, by: number) => `${bx},${by}`
  for (const f of farms) {
    if (f.x < w - radiusM || f.x > e + radiusM || f.y < s - radiusM || f.y > n + radiusM) continue
    const k = key(Math.floor(f.x / cell), Math.floor(f.y / cell))
    const b = buckets.get(k)
    if (b) b.push(f)
    else buckets.set(k, [f])
  }
  if (!buckets.size) return { bounds, width, height, values, radiusKm }
  const r2 = radiusM * radiusM
  const dx = (e - w) / width
  const dy = (n - s) / height
  for (let row = 0; row < height; row++) {
    const py = n - (row + 0.5) * dy
    const by = Math.floor(py / cell)
    for (let col = 0; col < width; col++) {
      const px = w + (col + 0.5) * dx
      const bx = Math.floor(px / cell)
      let num = 0
      let den = 0
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          const b = buckets.get(key(bx + i, by + j))
          if (!b) continue
          for (const f of b) {
            const ddx = f.x - px
            const ddy = f.y - py
            const d2 = ddx * ddx + ddy * ddy
            if (d2 >= r2) continue
            const k = 1 - d2 / r2
            num += k * f.treat
            den += k * f.prod
          }
        }
      if (den >= minDen) values[row * width + col] = num / den
    }
  }
  return { bounds, width, height, values, radiusKm }
}

export function heatColour(v: number, max = HEAT_MAX): [number, number, number] {
  const i = Math.min(HEAT_RAMP.length - 1, Math.floor((v / max) * HEAT_RAMP.length))
  const hex = HEAT_RAMP[i]
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

/** Paint the grid onto a canvas (transparent where NaN). */
export function paintHeat(grid: HeatGrid, canvas: HTMLCanvasElement, alpha = 0.75, max = HEAT_MAX): void {
  canvas.width = grid.width
  canvas.height = grid.height
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(grid.width, grid.height)
  for (let i = 0; i < grid.values.length; i++) {
    const v = grid.values[i]
    if (Number.isNaN(v)) continue
    const [r, g, b] = heatColour(v, max)
    img.data[i * 4] = r
    img.data[i * 4 + 1] = g
    img.data[i * 4 + 2] = b
    img.data[i * 4 + 3] = Math.round(255 * alpha)
  }
  ctx.putImageData(img, 0, 0)
}

const lastGrids = new Map<string, HeatGrid>()
export const setLastHeat = (id: string, g: HeatGrid | null) => (g ? lastGrids.set(id, g) : lastGrids.delete(id))

/** Value at a Web-Mercator point from layer `id`'s last computed grid, undefined when outside or not computed. */
export function heatValueAt(id: string, mx: number, my: number): { value: number; radiusKm: number } | undefined {
  const g = lastGrids.get(id)
  if (!g) return undefined
  const [w, s, e, n] = g.bounds
  if (mx < w || mx >= e || my < s || my >= n) return undefined
  const col = Math.floor(((mx - w) / (e - w)) * g.width)
  const row = Math.floor(((n - my) / (n - s)) * g.height)
  const v = g.values[row * g.width + col]
  return Number.isNaN(v) ? undefined : { value: v, radiusKm: g.radiusKm }
}
