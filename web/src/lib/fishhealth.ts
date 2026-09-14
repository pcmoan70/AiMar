// BarentsWatch fish-health snapshot (see scripts/fetch-fishhealth.mjs).
import { dataUrl, haversineKm, type Localities } from './localities'

export const FLAG = { reported: 1, fallow: 2, mechanical: 4, substance: 8, cleanerfish: 16, pd: 32, ila: 64 } as const

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
