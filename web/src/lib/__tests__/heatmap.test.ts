import { describe, expect, it } from 'vitest'
import { computeHeat, farmTreatmentStats, heatColour, type FarmStat } from '../heatmap'
import { FLAG, type FishHealth } from '../fishhealth'
import type { Localities, LocalityProps } from '../localities'

const p = (loknr: number): LocalityProps => ({
  loknr, navn: `L${loknr}`, status_lokalitet: 'AKTIV', kapasitet_lok: null, kapasitet_unittype: null, plassering: 'SJØ',
  vannmiljo: 'SALTVANN', fylke: '', kommune: '', til_arter: null, til_innehavere: null, til_formaal: null,
  til_produksjonsform: null, prodareacode: null, klareringsdato: null, lokalitet_url: null,
})

describe('farmTreatmentStats', () => {
  it('counts production and treatment weeks, skipping unreported weeks', () => {
    const data: FishHealth = {
      retrieved: '', weeks: ['w1', 'w2', 'w3', 'w4'],
      localities: { '1': { l: [0.1, null, 0.3, 0.2], f: [FLAG.reported, FLAG.fallow, FLAG.reported | FLAG.mechanical, FLAG.reported | FLAG.substance] } },
    }
    const locs: Localities = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [5, 60] }, properties: p(1) }] }
    const [f] = farmTreatmentStats(data, locs, 4)
    expect(f.prod).toBe(3)
    expect(f.treat).toBe(2)
  })
})

describe('computeHeat', () => {
  const farms: FarmStat[] = [
    { x: 0, y: 0, prod: 100, treat: 10 }, // 10 %
    { x: 20000, y: 0, prod: 100, treat: 30 }, // 30 %
  ]
  it('gives each farm its own ratio at its position and blends between them', () => {
    const g = computeHeat(farms, [-5000, -5000, 25000, 5000], 30, 10, 10000, 10)
    const at = (x: number) => g.values[5 * 30 + Math.floor(((x + 5000) / 30000) * 30)]
    expect(at(0)).toBeCloseTo(0.1, 2)
    expect(at(20000)).toBeCloseTo(0.3, 2)
    expect(at(10000)).toBeNaN() // both farms are exactly R away: no weight
  })
  it('blends with a larger radius and is transparent far away', () => {
    const g = computeHeat(farms, [-5000, -5000, 25000, 5000], 30, 10, 20000, 20)
    const mid = g.values[5 * 30 + 15]
    expect(mid).toBeGreaterThan(0.1)
    expect(mid).toBeLessThan(0.3)
    const far = computeHeat(farms, [100000, 100000, 110000, 110000], 10, 10, 20000, 20)
    expect(Number.isNaN(far.values[0])).toBe(true)
  })
  it('maps ratios onto the ramp', () => {
    expect(heatColour(0)).toEqual([0xfd, 0xe8, 0xd5])
    expect(heatColour(1)).toEqual([0x7f, 0x2c, 0x0c])
  })
})
