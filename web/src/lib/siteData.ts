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
