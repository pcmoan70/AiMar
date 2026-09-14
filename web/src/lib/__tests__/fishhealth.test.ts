import { describe, expect, it } from 'vitest'
import { FLAG, licePressure, liceSeries, summarise, type FishHealth } from '../fishhealth'
import type { Localities, LocalityProps } from '../localities'

const weeks = ['2025-50', '2025-51', '2025-52', '2026-01']
const data: FishHealth = {
  retrieved: '2026-09-14T00:00:00Z',
  weeks,
  localities: {
    '1': { l: [0.1, 0.8, null, 0.3], f: [FLAG.reported, FLAG.reported | FLAG.mechanical, FLAG.fallow, FLAG.reported] },
    '2': { l: [1.0, 1.2, 0.9, 0.7], f: [FLAG.reported, FLAG.reported, FLAG.reported | FLAG.substance, FLAG.reported] },
  },
}
const p = (loknr: number): LocalityProps => ({
  loknr, navn: `L${loknr}`, status_lokalitet: 'AKTIV', kapasitet_lok: null, kapasitet_unittype: null, plassering: 'SJØ',
  vannmiljo: 'SALTVANN', fylke: '', kommune: '', til_arter: null, til_innehavere: null, til_formaal: null,
  til_produksjonsform: null, prodareacode: null, klareringsdato: null, lokalitet_url: null,
})
const localities: Localities = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5.0, 60.0] }, properties: p(1) },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5.25, 60.0] }, properties: p(2) }, // ~14 km east
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5.0, 60.05] }, properties: p(3) }, // no data
  ],
}

describe('liceSeries', () => {
  it('aligns values and flags with week labels', () => {
    const s = liceSeries(data, 1)!
    expect(s).toHaveLength(4)
    expect(s[1]).toEqual({ week: '2025-51', lice: 0.8, flags: FLAG.reported | FLAG.mechanical })
  })
  it('returns null for unknown localities', () => expect(liceSeries(data, 99)).toBeNull())
})

describe('summarise', () => {
  it('counts reported weeks, exceedances and treatments', () => {
    const s = summarise(liceSeries(data, 1)!)
    expect(s.latest).toEqual({ week: '2026-01', lice: 0.3, flags: FLAG.reported })
    expect(s.weeksReported).toBe(3)
    expect(s.weeksAboveLimit).toBe(1)
    expect(s.treatments).toBe(1)
    expect(s.fallowNow).toBe(false)
  })
  it('flags a currently fallow site', () => {
    expect(summarise(liceSeries(data, 1)!.slice(0, 3)).fallowNow).toBe(true)
  })
})

describe('licePressure', () => {
  it('aggregates reported farm-weeks within each radius', () => {
    const [r10, r20] = licePressure(data, localities, [5.0, 60.0])
    expect(r10.farmsReporting).toBe(1)
    expect(r10.meanLice).toBeCloseTo((0.1 + 0.8 + 0.3) / 3, 5)
    expect(r10.shareAboveLimit).toBeCloseTo(1 / 3, 5)
    expect(r20.farmsReporting).toBe(2)
    expect(r20.shareAboveLimit).toBeCloseTo(5 / 7, 5)
  })
  it('returns nulls when nothing is reported nearby', () => {
    const [r] = licePressure(data, localities, [10, 70], [5])
    expect(r).toEqual({ km: 5, farmsReporting: 0, meanLice: null, shareAboveLimit: null })
  })
})

describe('operatorPressureSeries', () => {
  it('weights reporting farms by inverse squared distance and skips silent weeks', async () => {
    const { operatorPressureSeries } = await import('../fishhealth')
    const near = { ...p(1), til_innehavere: 'ACME AS' } // 1: at 5.0,60.0
    const mid = { ...p(2), til_innehavere: 'ACME AS' } // 2: ~14 km east
    const other = { ...p(3), til_innehavere: 'OTHER AS' }
    const locs: Localities = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [5.0, 60.0] }, properties: near },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [5.25, 60.0] }, properties: mid },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [5.0, 60.05] }, properties: other },
      ],
    }
    // viewed from 5.1,60.0: farm 1 is ~5.6 km, farm 2 ~8.3 km
    const s = operatorPressureSeries(data, locs, 'ACME AS', [5.1, 60.0], null)
    expect(s.farms).toBe(2)
    // week 0: farm1 0.1, farm2 1.0 -> weighted towards the nearer farm 1 (< simple mean 0.55)
    expect(s.values[0]!).toBeLessThan(0.55)
    expect(s.values[0]!).toBeGreaterThan(0.1)
    // week 2: farm1 fallow (null) -> only farm2 counts
    expect(s.values[2]).toBeCloseTo(0.9, 5)
    // excluding the site itself removes it from the pool
    expect(operatorPressureSeries(data, locs, 'ACME AS', [5.1, 60.0], 2).values[0]).toBeCloseTo(0.1, 5)
    expect(operatorPressureSeries(data, locs, 'NOBODY', [5.1, 60.0], null).farms).toBe(0)
  })
})
