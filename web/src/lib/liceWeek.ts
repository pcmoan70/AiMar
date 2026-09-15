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
/** What the weekly heatmap shows. */
export type WeekHeatMode = 'lice' | 'treatment'
export const WEEK_HEAT_MODES: WeekHeatMode[] = ['lice', 'treatment']
/** Colour scale tops: adult female lice per fish, and share of nearby farms treated that week
 *  (the national p90 of the kernel-weighted share is about 0.35). */
export const WEEK_HEAT_MAX: Record<WeekHeatMode, number> = { lice: 1, treatment: 0.5 }
export const LICE_HEAT_MAX = WEEK_HEAT_MAX.lice

export const liceBin = (v: number) => LICE_BINS.findIndex((b) => v < b.max)
export const liceColour = (v: number | null | undefined) => (v == null ? NOT_REPORTED_COLOUR : LICE_BINS[liceBin(v)].colour)

/** Reported lice per locality in week `i` of the snapshot (null = no report). */
export function liceAtWeek(data: FishHealth, i: number): Map<number, number | null> {
  const out = new Map<number, number | null>()
  for (const [nr, d] of Object.entries(data.localities)) out.set(Number(nr), d.l[i] ?? null)
  return out
}

/** Farms reporting in week `i`, as heat inputs: prod = 1 and treat = the value being smoothed, so the
 *  kernel ratio is a weighted mean — the lice level, or 1/0 for a treatment registered that week. */
export function farmWeekStats(data: FishHealth, localities: Localities, i: number, mode: WeekHeatMode = 'lice'): FarmStat[] {
  const out: FarmStat[] = []
  for (const f of localities.features) {
    const d = data.localities[String(f.properties.loknr)]
    const v = d?.l[i]
    if (v == null || d.f[i] & FLAG.fallow) continue
    const [x, y] = toMerc(f.geometry.coordinates[0], f.geometry.coordinates[1])
    out.push({ x, y, prod: 1, treat: mode === 'treatment' ? (d.f[i] & (FLAG.mechanical | FLAG.substance) ? 1 : 0) : v })
  }
  return out
}
export const farmLiceStats = (data: FishHealth, localities: Localities, i: number) => farmWeekStats(data, localities, i, 'lice')

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

export interface WeekShares {
  /** share (0–1) of reporting farms above the limit in force, per week */
  above: number[]
  /** share (0–1) of reporting farms with mechanical or medicinal treatment, per week */
  treated: number[]
  reporting: number[]
}
/** Whole-period series for the scrubber sparklines. */
export function weekShares(data: FishHealth, fylkeOf: (loknr: number) => string | null | undefined): WeekShares {
  const n = data.weeks.length
  const above = new Array(n).fill(0)
  const treated = new Array(n).fill(0)
  const reporting = new Array(n).fill(0)
  for (const [nr, d] of Object.entries(data.localities)) {
    const fylke = fylkeOf(Number(nr))
    for (let i = 0; i < n; i++) {
      const v = d.l[i]
      if (v == null) continue
      reporting[i]++
      if (v > liceLimit(data.weeks[i], fylke)) above[i]++
      if (d.f[i] & (FLAG.mechanical | FLAG.substance)) treated[i]++
    }
  }
  return { above: above.map((a, i) => (reporting[i] ? a / reporting[i] : 0)), treated: treated.map((a, i) => (reporting[i] ? a / reporting[i] : 0)), reporting }
}

// Current week's values for the map hover card (set by App, read by HoverInfo).
let current: Map<number, number | null> | null = null
export const setLiceWeekValues = (m: Map<number, number | null> | null) => (current = m)
export const liceWeekValue = (loknr: number) => current?.get(loknr)

// ---- Seasonal view: the same measures averaged per ISO week number over all years.
export const SEASON_WEEKS = 53

export interface SeasonShares {
  /** mean over years of the weekly share above the limit, per week number 1…53 */
  above: number[]
  treated: number[]
  /** the most recent year's value for that week number, null where the year has no such week */
  lastAbove: (number | null)[]
  lastTreated: (number | null)[]
  /** how many years contributed to each week number */
  counts: number[]
  years: [number, number]
}

/** Averages the whole-period series by week number, and keeps the last 52 weeks as a separate series. */
export function seasonShares(weeks: string[], shares: WeekShares): SeasonShares {
  const above = new Array(SEASON_WEEKS).fill(0)
  const treated = new Array(SEASON_WEEKS).fill(0)
  const counts = new Array(SEASON_WEEKS).fill(0)
  const lastAbove: (number | null)[] = new Array(SEASON_WEEKS).fill(null)
  const lastTreated: (number | null)[] = new Array(SEASON_WEEKS).fill(null)
  for (let i = 0; i < weeks.length; i++) {
    const w = Number(weeks[i].slice(5)) - 1
    if (w < 0 || w >= SEASON_WEEKS || !shares.reporting[i]) continue
    above[w] += shares.above[i]
    treated[w] += shares.treated[i]
    counts[w]++
  }
  for (let i = Math.max(0, weeks.length - 52); i < weeks.length; i++) {
    const w = Number(weeks[i].slice(5)) - 1
    if (w < 0 || w >= SEASON_WEEKS || !shares.reporting[i]) continue
    lastAbove[w] = shares.above[i]
    lastTreated[w] = shares.treated[i]
  }
  return {
    above: above.map((v, i) => (counts[i] ? v / counts[i] : 0)),
    treated: treated.map((v, i) => (counts[i] ? v / counts[i] : 0)),
    lastAbove,
    lastTreated,
    counts,
    years: [Number(weeks[0].slice(0, 4)), Number(weeks[weeks.length - 1].slice(0, 4))],
  }
}

const weekIndexes = (weeks: string[], weekOfYear: number) => weeks.map((w, i) => (Number(w.slice(5)) === weekOfYear ? i : -1)).filter((i) => i >= 0)

/** Per locality: the mean of its reported lice in that week number across all years (null = never reported then). */
export function liceAtSeasonWeek(data: FishHealth, weekOfYear: number): Map<number, number | null> {
  const idx = weekIndexes(data.weeks, weekOfYear)
  const out = new Map<number, number | null>()
  for (const [nr, d] of Object.entries(data.localities)) {
    let sum = 0
    let n = 0
    for (const i of idx) {
      const v = d.l[i]
      if (v == null || d.f[i] & FLAG.fallow) continue
      sum += v
      n++
    }
    out.set(Number(nr), n ? Math.round((sum / n) * 100) / 100 : null)
  }
  return out
}

/** Heat inputs for the seasonal view: mean lice, or the share of that site's years treated in that week number. */
export function farmSeasonStats(data: FishHealth, localities: Localities, weekOfYear: number, mode: WeekHeatMode = 'lice'): FarmStat[] {
  const idx = weekIndexes(data.weeks, weekOfYear)
  const out: FarmStat[] = []
  for (const f of localities.features) {
    const d = data.localities[String(f.properties.loknr)]
    if (!d) continue
    let sum = 0
    let n = 0
    for (const i of idx) {
      const v = d.l[i]
      if (v == null || d.f[i] & FLAG.fallow) continue
      n++
      sum += mode === 'treatment' ? (d.f[i] & (FLAG.mechanical | FLAG.substance) ? 1 : 0) : v
    }
    if (!n) continue
    const [x, y] = toMerc(f.geometry.coordinates[0], f.geometry.coordinates[1])
    out.push({ x, y, prod: 1, treat: sum / n })
  }
  return out
}
