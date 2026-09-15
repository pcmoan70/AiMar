// BarentsWatch fish-health snapshot (see scripts/fetch-fishhealth.mjs).
import { dataUrl, haversineKm, operatorsOf, type Localities } from './localities'

export const FLAG = { reported: 1, fallow: 2, mechanical: 4, substance: 8, cleanerfish: 16, pd: 32, ila: 64 } as const

/** Regulatory action limit for adult female lice per fish. */
/** Ordinary limit: adult female lice per fish (luseforskriften § 8). */
export const LICE_LIMIT = 0.5
/** Spring limit, in weeks 16–21 from Trøndelag southwards and weeks 21–26 from Nordland northwards. */
export const SPRING_LIMIT = 0.2
const NORTHERN = new Set(['NORDLAND', 'TROMS', 'FINNMARK', 'TROMS OG FINNMARK'])
export const isNorthern = (fylke?: string | null) => NORTHERN.has((fylke ?? '').toUpperCase())
/** The limit in force for a "YYYY-WW" week at a site in `fylke` (unknown county: southern rule). */
export function liceLimit(week: string, fylke?: string | null): number {
  const w = Number(week.slice(5))
  const spring = isNorthern(fylke) ? w >= 21 && w <= 26 : w >= 16 && w <= 21
  return spring ? SPRING_LIMIT : LICE_LIMIT
}
/** Both regional limits for a week, for labels. */
export const limitsForWeek = (week: string) => ({ south: liceLimit(week, 'TRØNDELAG'), north: liceLimit(week, 'NORDLAND') })

export interface FishHealth {
  retrieved: string
  /** ISO week labels, e.g. "2024-07". */
  weeks: string[]
  localities: Record<string, { l: (number | null)[]; f: number[] }>
}

export interface WeekPoint {
  week: string
  lice: number | null
  flags: number
  /** limit in force that week at this site */
  limit: number
}

export async function loadFishHealth(): Promise<FishHealth> {
  const res = await fetch(dataUrl('fishhealth.json'))
  if (!res.ok) throw new Error(`fishhealth: HTTP ${res.status}`)
  return res.json()
}

export function liceSeries(data: FishHealth, loknr: number, fylke?: string | null): WeekPoint[] | null {
  const d = data.localities[String(loknr)]
  if (!d) return null
  return data.weeks.map((week, i) => ({ week, lice: d.l[i], flags: d.f[i], limit: liceLimit(week, fylke) }))
}

export interface LiceSummary {
  latest: WeekPoint | null
  weeksAboveLimit: number
  weeksReported: number
  treatments: number
  fallowNow: boolean
}

/** Summary over the last `n` weeks of a series. */
export function summarise(series: WeekPoint[], n = 52): LiceSummary {
  const recent = series.slice(-n)
  const reported = recent.filter((p) => p.lice != null)
  const last = series[series.length - 1]
  return {
    latest: [...series].reverse().find((p) => p.lice != null) ?? null,
    weeksAboveLimit: reported.filter((p) => (p.lice ?? 0) > p.limit).length,
    weeksReported: reported.length,
    treatments: recent.filter((p) => p.flags & (FLAG.mechanical | FLAG.substance)).length,
    fallowNow: !!last && (last.flags & FLAG.fallow) !== 0,
  }
}

export interface LicePressure {
  km: number
  farmsReporting: number
  meanLice: number | null
  shareAboveLimit: number | null
}

/** Regional lice pressure around a point: reported farm-weeks within radius over the last `n` weeks. */
export function licePressure(
  data: FishHealth,
  localities: Localities,
  at: [number, number],
  radii = [10, 20],
  n = 52,
): LicePressure[] {
  return radii.map((km) => {
    let farms = 0
    let sum = 0
    let count = 0
    let above = 0
    for (const f of localities.features) {
      if (haversineKm(at, f.geometry.coordinates as [number, number]) > km) continue
      const d = data.localities[String(f.properties.loknr)]
      if (!d) continue
      const start = Math.max(0, d.l.length - n)
      let reported = 0
      for (let i = start; i < d.l.length; i++) {
        const v = d.l[i]
        if (v == null) continue
        reported++
        sum += v
        count++
        if (v > liceLimit(data.weeks[i], f.properties.fylke)) above++
      }
      if (!reported) continue
      farms++
      {
      }
    }
    return {
      km,
      farmsReporting: farms,
      meanLice: count ? sum / count : null,
      shareAboveLimit: count ? above / count : null,
    }
  })
}

export interface OperatorSeries {
  operator: string
  /** Farms that contributed (within range, excluding the site itself). */
  farms: number
  /** Distance-weighted lice per week, null where none of the farms reported. */
  values: (number | null)[]
}

/** Nearest distance used for weighting, so a neighbour a few hundred metres away cannot dominate everything. */
export const MIN_DISTANCE_KM = 0.5
export const MAX_DISTANCE_KM = 150

/**
 * Lice at other farms as seen from `at`, per week: the mean of the farms'
 * reported values weighted by 1/d² (passive radial spread), over farms that
 * reported that week only. A missing weekly report means the farm was not
 * operating (fallow or empty), never zero lice, so such farms carry no weight
 * that week. The site itself (`excludeLoknr`) is left out. With `operator`
 * undefined every farm within range counts.
 */
export function operatorPressureSeries(
  data: FishHealth,
  localities: Localities,
  operator: string | undefined,
  at: [number, number],
  excludeLoknr: number | null,
): OperatorSeries {
  const farms: { w: number; l: (number | null)[] }[] = []
  for (const f of localities.features) {
    if (f.properties.loknr === excludeLoknr) continue
    if (operator !== undefined && !operatorsOf(f.properties).includes(operator)) continue
    const d = data.localities[String(f.properties.loknr)]
    if (!d) continue
    const km = haversineKm(at, f.geometry.coordinates as [number, number])
    if (km > MAX_DISTANCE_KM) continue
    farms.push({ w: 1 / Math.max(km, MIN_DISTANCE_KM) ** 2, l: d.l })
  }
  const values = data.weeks.map((_, i) => {
    let sum = 0
    let wsum = 0
    for (const farm of farms) {
      const v = farm.l[i]
      if (v == null) continue
      sum += farm.w * v
      wsum += farm.w
    }
    return wsum > 0 ? sum / wsum : null
  })
  return { operator: operator ?? 'all', farms: farms.length, values }
}

export interface LiceStats {
  mean: number
  max: number
  weeksAbove: number
  treatments: number
}

const statsCache = new WeakMap<FishHealth, Map<number, LiceStats>>()

/** Per-locality statistics over the last `n` weeks of the snapshot, for filtering: mean and peak of reported lice, weeks above the limit, weeks with treatment. Sites without any report in the window are absent. */
export function liceStatsIndex(data: FishHealth, localities?: Localities | null, n = 52): Map<number, LiceStats> {
  const cached = statsCache.get(data)
  if (cached) return cached
  const fylkeOf = new Map(localities?.features.map((x) => [x.properties.loknr, x.properties.fylke]) ?? [])
  const out = new Map<number, LiceStats>()
  for (const [nr, d] of Object.entries(data.localities)) {
    const l = d.l.slice(-n)
    const f = d.f.slice(-n)
    const weeks = data.weeks.slice(-n)
    const fylke = fylkeOf.get(Number(nr))
    const vals = l.filter((v): v is number => v != null)
    if (!vals.length) continue
    out.set(Number(nr), {
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
      max: Math.max(...vals),
      weeksAbove: l.filter((v, i) => v != null && v > liceLimit(weeks[i], fylke)).length,
      treatments: f.filter((x) => x & (FLAG.mechanical | FLAG.substance)).length,
    })
  }
  statsCache.set(data, out)
  return out
}
