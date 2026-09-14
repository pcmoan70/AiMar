import { describe, expect, it } from 'vitest'
import { activeFilterKeys, describeFilter, filterValueOf, filteredLoknrs, matchesFilters } from '../filters'
import type { Localities, LocalityProps } from '../localities'

const p = (over: Partial<LocalityProps>): LocalityProps => ({
  loknr: 1, navn: 'A', status_lokalitet: 'AKTIV', kapasitet_lok: 3120, kapasitet_unittype: 'TN', plassering: 'SJØ',
  vannmiljo: 'SALTVANN', fylke: 'ROGALAND', kommune: 'KARMØY', til_arter: 'Laks, Ørret', til_innehavere: 'MOWI ASA',
  til_formaal: 'KOMMERSIELL', til_produksjonsform: 'Matfisk', prodareacode: '3', klareringsdato: null, lokalitet_url: null,
  ...over,
})

describe('field filters', () => {
  it('derives filter values from a site', () => {
    const s = p({})
    expect(filterValueOf('species', s)).toBe('Laks')
    expect(filterValueOf('capacityMin', s)).toBe(3120)
    expect(filterValueOf('capacityMin', p({ kapasitet_unittype: 'STK' }))).toBeUndefined()
    expect(filterValueOf('prodArea', p({ prodareacode: null }))).toBeUndefined()
  })
  it('matches equality, capacity threshold and species membership', () => {
    const s = p({})
    expect(matchesFilters(s, { status: 'AKTIV', municipality: 'KARMØY' })).toBe(true)
    expect(matchesFilters(s, { status: 'SLETTET' })).toBe(false)
    expect(matchesFilters(s, { capacityMin: 3000 })).toBe(true)
    expect(matchesFilters(s, { capacityMin: 4000 })).toBe(false)
    expect(matchesFilters(s, { species: 'Ørret' })).toBe(true)
    expect(matchesFilters(s, { species: 'Torsk' })).toBe(false)
  })
  it('lists and describes active filters', () => {
    expect(activeFilterKeys({ status: 'AKTIV', species: undefined })).toEqual(['status'])
    expect(describeFilter('capacityMin', { capacityMin: 3120 })).toBe('Capacity ≥ 3,120 t')
    expect(describeFilter('prodArea', { prodArea: '3' })).toBe('Production area: 3')
  })
  it('combines operator selection with field filters', () => {
    const fc: Localities = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 60] }, properties: p({ loknr: 1 }) },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 60] }, properties: p({ loknr: 2, til_innehavere: 'OTHER AS' }) },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 60] }, properties: p({ loknr: 3, prodareacode: '4' }) },
      ],
    }
    expect(filteredLoknrs(fc, [], {})).toBeNull()
    expect(filteredLoknrs(fc, ['MOWI ASA'], {})?.sort()).toEqual([1, 3])
    expect(filteredLoknrs(fc, ['MOWI ASA'], { prodArea: '3' })).toEqual([1])
    expect(filteredLoknrs(fc, [], { prodArea: '4' })).toEqual([3])
  })
})
