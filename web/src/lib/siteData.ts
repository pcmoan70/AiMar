// Optional per-site datasets produced by scripts/fetch-seatemp.mjs and scripts/fetch-tides.mjs.
import { dataUrl } from './localities'

export interface SeaTemp {
  retrieved: string
  /** ISO week labels, same convention as fishhealth.json */
  weeks: string[]
  /** loknr -> weekly farm-reported sea temperature (°C) or null */
  localities: Record<string, (number | null)[]>
}

export interface TideStats {
  gauge: string | null
  factor: number | null
  meanHigh: number
  meanLow: number
  meanRange: number
  maxRange: number
  hat: number
  lat: number
}
export interface Tides {
  retrieved: string
  year: number
  localities: Record<string, TideStats>
}

async function optional<T>(file: string): Promise<T | null> {
  try {
    const res = await fetch(dataUrl(file))
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}
export const loadSeaTemp = () => optional<SeaTemp>('seatemp.json')
export const loadTides = () => optional<Tides>('tides.json')

/** Plausible Norwegian coastal sea temperature; a few reports are typing errors (up to 98 °C). */
const PLAUSIBLE: [number, number] = [-2, 30]

/** Temperature values re-aligned onto `weeks` (the lice series' week labels); null where absent or implausible. */
export function tempSeries(data: SeaTemp, loknr: number, weeks: string[]): (number | null)[] | null {
  const vals = data.localities[String(loknr)]
  if (!vals) return null
  const idx = new Map(data.weeks.map((w, i) => [w, i]))
  return weeks.map((w) => {
    const i = idx.get(w)
    const v = i === undefined ? null : (vals[i] ?? null)
    return v == null || v < PLAUSIBLE[0] || v > PLAUSIBLE[1] ? null : v
  })
}

/** Default warm-water threshold: above it lice development is fast, eggs reach the infective stage in about a week. */
export const WARM_C = 12.5
/** Choices offered in ⚙ Settings. */
export const WARM_CHOICES = [8, 10, 11, 12, 12.5, 13, 14, 16]

const count = (values: (number | null)[][], threshold: number) => {
  let above = 0
  let measured = 0
  for (const v of values) {
    const vals = v.filter((x): x is number => x != null)
    if (!vals.length) continue
    measured++
    if (vals.reduce((a, b) => a + b, 0) / vals.length > threshold) above++
  }
  return { above, measured }
}

/** Sites reporting above WARM_C in one week, and how many reported a temperature at all. */
export function warmAtWeek(data: SeaTemp, label: string, threshold = WARM_C): { above: number; measured: number } {
  const i = data.weeks.indexOf(label)
  if (i < 0) return { above: 0, measured: 0 }
  return count(
    Object.values(data.localities).map((arr) => [arr[i] ?? null]),
    threshold,
  )
}

/** The same by ISO week number, each site averaged over the years it reported. */
export function warmAtSeasonWeek(data: SeaTemp, weekOfYear: number, threshold = WARM_C): { above: number; measured: number } {
  const idx = data.weeks.map((w, i) => (Number(w.slice(5)) === weekOfYear ? i : -1)).filter((i) => i >= 0)
  return count(
    Object.values(data.localities).map((arr) => idx.map((i) => arr[i] ?? null)),
    threshold,
  )
}

/** Number of sites reporting a temperature above `threshold`, per week label.
 *  The caller divides by the operating (lice-reporting) sites, so every share in the readout has the same base. */
export function warmCounts(data: SeaTemp, weeks: string[], threshold: number): number[] {
  const at = new Map(data.weeks.map((w, i) => [w, i]))
  const arrays = Object.values(data.localities)
  return weeks.map((w) => {
    const i = at.get(w)
    if (i === undefined) return 0
    let above = 0
    for (const arr of arrays) {
      const v = arr[i]
      if (v != null && v > threshold) above++
    }
    return above
  })
}
