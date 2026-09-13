import { describe, expect, it } from 'vitest'
import { haversineKm, isSalmon, neighbourhood, type Localities, type LocalityProps } from '../localities'

const props = (over: Partial<LocalityProps>): LocalityProps => ({
  loknr: 1, navn: 'A', status_lokalitet: 'AKTIV', kapasitet_lok: 1000, kapasitet_unittype: 'TN',
  plassering: 'SJØ', vannmiljo: 'SALTVANN', fylke: '', kommune: '', til_arter: 'Laks', til_innehavere: null,
  til_formaal: null, til_produksjonsform: null, prodareacode: null, klareringsdato: null, lokalitet_url: null,
  ...over,
})
const fc: Localities = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5.0, 60.0] }, properties: props({ loknr: 1, navn: 'Near', kapasitet_lok: 1000 }) },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5.2, 60.0] }, properties: props({ loknr: 2, navn: 'Mid', kapasitet_lok: 2000 }) },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [6.0, 60.0] }, properties: props({ loknr: 3, navn: 'Far', kapasitet_lok: 4000, kapasitet_unittype: 'STK' }) },
  ],
}

describe('haversineKm', () => {
  it('is zero for identical points', () => expect(haversineKm([5, 60], [5, 60])).toBe(0))
  it('gives ~111 km per degree of latitude', () => expect(haversineKm([5, 60], [5, 61])).toBeCloseTo(111.2, 0))
})

describe('neighbourhood', () => {
  const nb = neighbourhood(fc, [5.02, 60.0])
  it('finds the nearest farm', () => {
    expect(nb.nearest?.loknr).toBe(1)
    expect(nb.nearest?.km).toBeCloseTo(1.1, 1)
  })
  it('counts farms and tonne capacity per radius', () => {
    const r = Object.fromEntries(nb.within.map((w) => [w.km, w]))
    expect(r[5].count).toBe(1)
    expect(r[10].count).toBe(1)
    expect(r[20].count).toBe(2)
    expect(r[20].capacityTn).toBe(3000)
    expect(r[50].count).toBe(2) // 'Far' is ~55 km away
  })
  it('only sums capacity measured in tonnes', () => {
    const all = neighbourhood(fc, [5.5, 60.0]).within.find((w) => w.km === 50)!
    expect(all.count).toBe(3)
    expect(all.capacityTn).toBe(3000)
  })
})

describe('isSalmon', () => {
  it('matches Laks case-insensitively', () => {
    expect(isSalmon(props({ til_arter: 'Laks, Regnbueørret' }))).toBe(true)
    expect(isSalmon(props({ til_arter: 'Torsk' }))).toBe(false)
    expect(isSalmon(props({ til_arter: null }))).toBe(false)
  })
})
