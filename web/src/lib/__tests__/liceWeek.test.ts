import { describe, expect, it } from 'vitest'
import { farmLiceStats, isoWeekStart, liceAtWeek, liceBin, liceColour, NOT_REPORTED_COLOUR, summariseWeek, weekShares } from '../liceWeek'
import type { FishHealth } from '../fishhealth'
import type { Localities } from '../localities'

const fh: FishHealth = {
  retrieved: '',
  weeks: ['2024-45', '2024-46'],
  localities: { '1': { l: [0.05, 0.7], f: [1, 1] }, '2': { l: [null, 0.3], f: [0, 1] }, '3': { l: [0.1, 0.1], f: [1, 3] } },
}
const loc = {
  type: 'FeatureCollection',
  features: [1, 2, 3].map((n) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [5 + n, 60] }, properties: { loknr: n } })),
} as unknown as Localities

describe('lice per week', () => {
  it('bins values with 0.5 as an edge', () => {
    expect([0, 0.09, 0.1, 0.49, 0.5, 0.99, 1, 3].map(liceBin)).toEqual([0, 0, 1, 2, 3, 3, 4, 4])
    expect(liceColour(null)).toBe(NOT_REPORTED_COLOUR)
  })
  it('reads one week and summarises it', () => {
    const w = liceAtWeek(fh, 1)
    expect([...w.entries()]).toEqual([[1, 0.7], [2, 0.3], [3, 0.1]])
    const south = () => 'VESTLAND'
    expect(summariseWeek(w, '2024-46', south)).toEqual({ reporting: 3, aboveLimit: 1, bins: [0, 1, 1, 1, 0] })
    expect(summariseWeek(w, '2024-18', south).aboveLimit).toBe(2) // spring limit 0.2 in week 18 in the south
    expect(summariseWeek(w, '2024-18', () => 'NORDLAND').aboveLimit).toBe(1) // north: spring weeks are 21–26
    expect(summariseWeek(liceAtWeek(fh, 0), '2024-45', south).reporting).toBe(2)
  })
  it('turns reporting, non-fallow farms into heat inputs', () => {
    const farms = farmLiceStats(fh, loc, 1)
    expect(farms.map((f) => f.treat)).toEqual([0.7, 0.3]) // site 3 is fallow (flag bit 2) in week 2
    expect(farms.every((f) => f.prod === 1)).toBe(true)
  })
  it('computes whole-period shares for the scrubber', () => {
    const w = weekShares(fh, () => 'VESTLAND')
    expect(w.reporting).toEqual([2, 3])
    expect(w.above).toEqual([0, 1 / 3]) // week 46: only 0.7 exceeds 0.5
    expect(w.treated).toEqual([0, 0])
  })
  it('finds the Monday of an ISO week', () => {
    expect(isoWeekStart(2024, 46).toISOString().slice(0, 10)).toBe('2024-11-11')
    expect(isoWeekStart(2021, 1).toISOString().slice(0, 10)).toBe('2021-01-04')
  })
})

describe('weekly heat inputs by mode', () => {
  it('smooths lice values or a treated flag', async () => {
    const { farmWeekStats } = await import('../liceWeek')
    const fh2: FishHealth = {
      retrieved: '',
      weeks: ['2024-46'],
      // site 1 reports 0.7 with a mechanical treatment, site 2 reports 0.3 untreated, site 3 is fallow
      localities: { '1': { l: [0.7], f: [1 | 4] }, '2': { l: [0.3], f: [1] }, '3': { l: [0.1], f: [1 | 2] } },
    }
    expect(farmWeekStats(fh2, loc, 0, 'lice').map((f) => f.treat)).toEqual([0.7, 0.3])
    expect(farmWeekStats(fh2, loc, 0, 'treatment').map((f) => f.treat)).toEqual([1, 0])
    expect(farmWeekStats(fh2, loc, 0, 'treatment').every((f) => f.prod === 1)).toBe(true)
  })
})

describe('season view', () => {
  it('averages by week number and keeps the last year separately', async () => {
    const { seasonShares, weekShares, liceAtSeasonWeek, farmSeasonStats } = await import('../liceWeek')
    const weeks = ['2023-20', '2023-21', '2024-20', '2024-21']
    const fh3: FishHealth = {
      retrieved: '',
      weeks,
      localities: {
        '1': { l: [0.2, 0.4, 0.6, null], f: [1, 1, 1 | 4, 0] },
        '2': { l: [0.8, null, 0.4, 0.2], f: [1, 0, 1, 1] },
      },
    }
    const sh = weekShares(fh3, () => 'VESTLAND')
    const sea = seasonShares(weeks, sh)
    // week 20 is a spring week in the south, limit 0.2: 2023 gives 1 of 2 above, 2024 gives 2 of 2 → mean 0.75
    expect(sea.above[19]).toBe(0.75)
    expect(sea.counts[19]).toBe(2)
    expect(sea.years).toEqual([2023, 2024])
    // the last 52 weeks cover both 2024 weeks only
    expect(sea.lastAbove[19]).toBe(sh.above[2])
    expect(sea.lastAbove[0]).toBeNull()
    // site 1 averages 0.2 and 0.6 across the two week-20s
    expect(liceAtSeasonWeek(fh3, 20).get(1)).toBeCloseTo(0.4)
    expect(liceAtSeasonWeek(fh3, 21).get(2)).toBeCloseTo(0.2)
    // treatment mode: site 1 was treated in one of its two week-20s
    const treat = farmSeasonStats(fh3, loc, 20, 'treatment')
    expect(treat.map((f) => f.treat)).toEqual([0.5, 0])
  })
})
