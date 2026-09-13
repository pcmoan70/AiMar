import { describe, expect, it } from 'vitest'
import { searchLocalities, type Localities, type LocalityProps } from '../localities'

const p = (loknr: number, navn: string): LocalityProps => ({
  loknr, navn, status_lokalitet: 'AKTIV', kapasitet_lok: null, kapasitet_unittype: null, plassering: 'SJØ',
  vannmiljo: 'SALTVANN', fylke: '', kommune: 'K', til_arter: null, til_innehavere: null, til_formaal: null,
  til_produksjonsform: null, prodareacode: null, klareringsdato: null, lokalitet_url: null,
})
const fc: Localities = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 60] }, properties: p(10029, 'TUHOLMANE Ø') },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 60] }, properties: p(10213, 'NAUSTNESET') },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 60] }, properties: p(45303, 'HOLMANE') },
  ],
}

describe('searchLocalities', () => {
  it('returns nothing for an empty query', () => expect(searchLocalities(fc, '  ')).toEqual([]))
  it('matches locality numbers by prefix', () => {
    expect(searchLocalities(fc, '1002').map((f) => f.properties.loknr)).toEqual([10029])
    expect(searchLocalities(fc, '10').map((f) => f.properties.loknr).sort()).toEqual([10029, 10213])
  })
  it('ranks exact and prefix name matches before substring matches', () => {
    expect(searchLocalities(fc, 'holmane').map((f) => f.properties.navn)).toEqual(['HOLMANE', 'TUHOLMANE Ø'])
  })
  it('is case-insensitive and honours the limit', () => {
    expect(searchLocalities(fc, 'n', 1)).toHaveLength(1)
  })
})
