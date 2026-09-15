// "Lice per week": colour every locality by its reported adult female lice in one chosen
// ISO week, and a kernel-weighted lice level over farms for the same week (see heatmap.ts).
import { FLAG, liceLimit, type FishHealth } from './fishhealth'
import { toMerc } from './featureInfo'
import type { Localities } from './localities'
import type { FarmStat } from './heatmap'
import { OTHER_COLOUR } from './operatorColours'

/** Sequential bins on the same orange ramp as the treatment heatmap; the 0.5 limit is a bin edge. */
export const LICE_BINS: { max: number; colour: string }[] = [
  { max: 0.1, colour: '#fbd0ad' },
  { max: 0.2, colour: '#f6b280' },
  { max: 0.5, colour: '#e46e34' },
  { max: 1, colour: '#a63d13' },
  { max: Infinity, colour: '#5e1f06' },
]
export const NOT_REPORTED_COLOUR = OTHER_COLOUR
/** Colour scale top of the weekly lice heatmap (adult female lice per fish). */
export const LICE_HEAT_MAX = 1

export const liceBin = (v: number) => LICE_BINS.findIndex((b) => v < b.max)
export const liceColour = (v: number | null | undefined) => (v == null ? NOT_REPORTED_COLOUR : LICE_BINS[liceBin(v)].colour)

/** Reported lice per locality in week `i` of the snapshot (null = no report). */
export function liceAtWeek(data: FishHealth, i: number): Map<number, number | null> {
  const out = new Map<number, number | null>()
  for (const [nr, d] of Object.entries(data.localities)) out.set(Number(nr), d.l[i] ?? null)
  return out
}

/** Farms reporting in week `i`, as heat inputs: treat = lice level, prod = 1 (so the kernel gives a weighted mean). */
export function farmLiceStats(data: FishHealth, localities: Localities, i: number): FarmStat[] {
  const out: FarmStat[] = []
  for (const f of localities.features) {
    const d = data.localities[String(f.properties.loknr)]
    const v = d?.l[i]
    if (v == null || d.f[i] & FLAG.fallow) continue
    const [x, y] = toMerc(f.geometry.coordinates[0], f.geometry.coordinates[1])
    out.push({ x, y, prod: 1, treat: v })
  }
  return out
}

/** Monday of ISO week `week` in `year`, as a UTC date. */
export function isoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const day = jan4.getUTCDay() || 7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7)
  return monday
}

/** Parse a "YYYY-WW" week label. */
export const parseWeek = (label: string) => ({ year: Number(label.slice(0, 4)), week: Number(label.slice(5)) })

export interface WeekSummary {
  reporting: number
  aboveLimit: number
  bins: number[]
}
/** `week` is the "YYYY-WW" label and `fylkeOf` the site's county, for the week/region limit. */
export function summariseWeek(values: Map<number, number | null>, week: string, fylkeOf: (loknr: number) => string | null | undefined): WeekSummary {
  const bins = LICE_BINS.map(() => 0)
  let reporting = 0
  let aboveLimit = 0
  for (const [nr, v] of values) {
    if (v == null) continue
    reporting++
    bins[liceBin(v)]++
    if (v > liceLimit(week, fylkeOf(nr))) aboveLimit++
  }
  return { reporting, aboveLimit, bins }
}

// Current week's values for the map hover card (set by App, read by HoverInfo).
let current: Map<number, number | null> | null = null
export const setLiceWeekValues = (m: Map<number, number | null> | null) => (current = m)
export const liceWeekValue = (loknr: number) => current?.get(loknr)
