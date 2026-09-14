import { describe, expect, it } from 'vitest'
import { operatorIndex, operatorsOf, sitesOfOperators, type Localities, type LocalityProps } from '../localities'

const p = (loknr: number, ops: string | null, cap = 1000): LocalityProps => ({
  loknr, navn: `L${loknr}`, status_lokalitet: 'AKTIV', kapasitet_lok: cap, kapasitet_unittype: 'TN', plassering: 'SJØ',
  vannmiljo: 'SALTVANN', fylke: '', kommune: '', til_arter: null, til_innehavere: ops, til_formaal: null,
  til_produksjonsform: null, prodareacode: null, klareringsdato: null, lokalitet_url: null,
})
const fc: Localities = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 60] }, properties: p(1, 'MOWI ASA, LERØY SEAFOOD AS') },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 60] }, properties: p(2, 'MOWI ASA', 3000) },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 60] }, properties: p(3, null) },
  ],
}

describe('operators', () => {
  it('splits the comma-separated operator list', () => {
    expect(operatorsOf(fc.features[0].properties)).toEqual(['MOWI ASA', 'LERØY SEAFOOD AS'])
    expect(operatorsOf(fc.features[2].properties)).toEqual([])
  })
  it('indexes operators by site count and capacity', () => {
    expect(operatorIndex(fc)).toEqual([
      { name: 'MOWI ASA', sites: 2, capacityTn: 4000 },
      { name: 'LERØY SEAFOOD AS', sites: 1, capacityTn: 1000 },
    ])
  })
  it('finds sites of the selected operators', () => {
    expect(sitesOfOperators(fc, ['LERØY SEAFOOD AS'])).toEqual([1])
    expect(sitesOfOperators(fc, ['MOWI ASA']).sort()).toEqual([1, 2])
    expect(sitesOfOperators(fc, [])).toEqual([])
  })
})
