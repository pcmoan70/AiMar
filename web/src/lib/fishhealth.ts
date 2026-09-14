// BarentsWatch fish-health snapshot (see scripts/fetch-fishhealth.mjs).
import { dataUrl, haversineKm, operatorsOf, type Localities } from './localities'

export const FLAG = { reported: 1, fallow: 2, mechanical: 4, substance: 8, cleanerfish: 16, pd: 32, ila: 64 } as const

/** Validated categorical palette (dataviz reference): site line first, then operator lines. */
export const SERIES_COLOURS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']

/** Regulatory action limit for adult female lice per fish. */
export const LICE_LIMIT = 0.5

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
}

export async function loadFishHealth(): Promise<FishHealth> {
  const res = await fetch(dataUrl('fishhealth.json'))
  if (!res.ok) throw new Error(`fishhealth: HTTP ${res.status}`)
  return res.json()
}

export function liceSeries(data: FishHealth, loknr: number): WeekPoint[] | null {
  const d = data.localities[String(loknr)]
  if (!d) return null
  return data.weeks.map((week, i) => ({ week, lice: d.l[i], flags: d.f[i] }))
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
    weeksAboveLimit: reported.filter((p) => (p.lice ?? 0) > LICE_LIMIT).length,
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
      const vals = d.l.slice(-n).filter((v): v is number => v != null)
      if (!vals.length) continue
      farms++
      for (const v of vals) {
        sum += v
        count++
        if (v > LICE_LIMIT) above++
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
 * Lice at an operator's farms as seen from `at`, per week: the mean of the farms'
 * reported values weighted by 1/d² (passive radial spread), over farms that
 * reported that week only (fallow or silent farms carry no weight). The site
 * itself (`excludeLoknr`) is left out.
 */
export function operatorPressureSeries(
  data: FishHealth,
  localities: Localities,
  operator: string,
  at: [number, number],
  excludeLoknr: number | null,
): OperatorSeries {
  const farms: { w: number; l: (number | null)[] }[] = []
  for (const f of localities.features) {
    if (f.properties.loknr === excludeLoknr) continue
    if (!operatorsOf(f.properties).includes(operator)) continue
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
  return { operator, farms: farms.length, values }
}
