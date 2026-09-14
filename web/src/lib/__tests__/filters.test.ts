import { describe, expect, it } from 'vitest'
import { activeFilterKeys, describeFilter, fieldValuesOf, filteredLoknrs, matchesFilters, toggleAll, toggleValue, valueOptions } from '../filters'
import type { Localities, LocalityProps } from '../localities'

const p = (over: Partial<LocalityProps>): LocalityProps => ({
  loknr: 1, navn: 'A', status_lokalitet: 'AKTIV', kapasitet_lok: 3120, kapasitet_unittype: 'TN', plassering: 'SJØ',
  vannmiljo: 'SALTVANN', fylke: 'ROGALAND', kommune: 'KARMØY', til_arter: 'Laks, Ørret', til_innehavere: 'MOWI ASA',
  til_formaal: 'KOMMERSIELL, FORSKNING', til_produksjonsform: 'Matfisk', prodareacode: '3', klareringsdato: null, lokalitet_url: null,
  ...over,
})
const fc: Localities = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 60] }, properties: p({ loknr: 1 }) },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 60] }, properties: p({ loknr: 2, til_innehavere: 'OTHER AS', kommune: 'BØMLO', til_formaal: 'FORSKNING' }) },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 60] }, properties: p({ loknr: 3, prodareacode: '4', kapasitet_lok: 9000, til_arter: 'Torsk' }) },
  ],
}

describe('field filters', () => {
  it('splits composite fields into component values', () => {
    const s = p({})
    expect(fieldValuesOf('purpose', s)).toEqual(['KOMMERSIELL', 'FORSKNING'])
    expect(fieldValuesOf('species', s)).toEqual(['Laks', 'Ørret'])
    expect(fieldValuesOf('capacity', s)).toEqual([{ min: 3120, max: 4680 }])
    expect(fieldValuesOf('capacity', p({ kapasitet_unittype: 'STK' }))).toEqual([])
  })
  it('matches when any selected value is among the site values', () => {
    const s = p({})
    expect(matchesFilters(s, { status: ['AKTIV'], municipality: ['KARMØY', 'BØMLO'] })).toBe(true)
    expect(matchesFilters(s, { status: ['SLETTET'] })).toBe(false)
    expect(matchesFilters(s, { purpose: ['FORSKNING'] })).toBe(true)
    expect(matchesFilters(s, { capacity: [{ min: 3120, max: 4680 }, { min: 7800, max: null }] })).toBe(true)
    expect(matchesFilters(s, { capacity: [{ min: 7800, max: null }] })).toBe(false)
    expect(matchesFilters(s, { species: ['Torsk'] })).toBe(false)
  })
  it('lists values alphabetically with counts; composite fields per component; capacity in range order', () => {
    expect(valueOptions(fc, 'municipality').map((o) => `${o.label}:${o.count}`)).toEqual(['BØMLO:1', 'KARMØY:2'])
    expect(valueOptions(fc, 'purpose').map((o) => `${o.label}:${o.count}`)).toEqual(['FORSKNING:3', 'KOMMERSIELL:2'])
    expect(valueOptions(fc, 'capacity').map((o) => o.count)).toEqual([0, 0, 0, 2, 0, 1])
  })
  it('toggles values and the All switch', () => {
    let f = toggleValue({}, 'status', 'AKTIV')
    expect(f.status).toEqual(['AKTIV'])
    f = toggleValue(f, 'status', 'AKTIV')
    expect(f.status).toBeUndefined()
    const opts = valueOptions(fc, 'municipality')
    f = toggleAll({}, 'municipality', opts)
    expect(f.municipality).toEqual(['BØMLO', 'KARMØY'])
    expect(toggleAll(f, 'municipality', opts).municipality).toBeUndefined()
  })
  it('describes and lists active filters', () => {
    expect(activeFilterKeys({ status: ['AKTIV'], species: [] })).toEqual(['status'])
    expect(describeFilter('capacity', { capacity: [{ min: 3120, max: 4680 }, { min: 7800, max: null }] })).toBe('Capacity: 3,120–4,680 t, ≥ 7,800 t')
  })
  it('combines operator selection with field filters', () => {
    expect(filteredLoknrs(fc, [], {})).toBeNull()
    expect(filteredLoknrs(fc, ['MOWI ASA'], {})?.sort()).toEqual([1, 3])
    expect(filteredLoknrs(fc, ['MOWI ASA'], { prodArea: ['3'] })).toEqual([1])
    expect(filteredLoknrs(fc, [], { purpose: ['FORSKNING'] })?.sort()).toEqual([1, 2, 3])
  })
})
