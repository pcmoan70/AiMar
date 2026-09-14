import { describe, expect, it } from 'vitest'
import { infoUrl, parseInfo, toMerc } from '../featureInfo'
import { layerById } from '../layers'

describe('parseInfo', () => {
  it('reads ncWMS values with units', () => {
    const xml = '<FeatureInfoResponse><Feature><FeatureInfo><value>15.012</value></FeatureInfo></Feature></FeatureInfoResponse>'
    expect(parseInfo({ kind: 'ncwms', unit: '°C' }, xml)).toBe('15.01 °C')
    expect(parseInfo({ kind: 'ncwms' }, '<FeatureInfoResponse><longitude>5</longitude></FeatureInfoResponse>')).toBeNull()
    expect(parseInfo({ kind: 'ncwms', direction: true }, '<FeatureInfoResponse><Feature><FeatureInfo><value>147.6</value></FeatureInfo></Feature></FeatureInfoResponse>')).toBe('towards SE (148°)')
  })
  it('summarises ArcGIS GeoJSON features by preferred keys', () => {
    const json = JSON.stringify({ type: 'FeatureCollection', features: [{ properties: { objectid: 1, navn: 'Jærstrendene', verneform: 'Landskapsvernområde' } }] })
    expect(parseInfo({ kind: 'arcgis', keys: ['navn', 'verneform'] }, json)).toBe('Jærstrendene · Landskapsvernområde')
    expect(parseInfo({ kind: 'arcgis' }, '{"type":"FeatureCollection","features":[]}')).toBeNull()
  })
  it('parses MapServer plain text', () => {
    const txt = "GetFeatureInfo results:\n\nLayer 'Ankringsforhold'\n  Feature 12:\n    ankringsforhold = 'Gode ankringsforhold (sand, grus)'\n    objectid = '12'\n"
    expect(parseInfo({ kind: 'mapserver', keys: ['ankringsforhold'] }, txt)).toBe('Gode ankringsforhold (sand, grus)')
    expect(parseInfo({ kind: 'mapserver' }, 'GetFeatureInfo results:\n\n  Search returned no results.\n')).toBeNull()
    expect(parseInfo({ kind: 'mapserver' }, '<ServiceExceptionReport/>')).toBeNull()
    const depth = "GetFeatureInfo results:\n\nLayer 'Dybdelag'\n  Feature 5:\n    minimumsdybde = '40'\n    maksimumsdybde = '50'\n"
    expect(parseInfo({ kind: 'mapserver', keys: ['minimumsdybde', 'maksimumsdybde'], unit: 'm' }, depth)).toBe('40–50 m')
    const bare = "GetFeatureInfo results:\n\nLayer 'layer_554'\n  Feature 2: \n"
    expect(parseInfo({ kind: 'mapserver', presence: 'inside a fairway area' }, bare)).toBe('inside a fairway area')
  })
})

describe('infoUrl', () => {
  it('centres a 101 px window on the point and carries WMS-T time', () => {
    const l = layerById('norkyst-temp')!
    const u = new URL(infoUrl(l, [5, 60], 10)!)
    expect(u.searchParams.get('request')).toBe('GetFeatureInfo')
    expect(u.searchParams.get('i')).toBe('50')
    const [x, y] = toMerc(5, 60)
    const bbox = u.searchParams.get('bbox')!.split(',').map(Number)
    expect(bbox[0]).toBeCloseTo(x - 500, 3)
    expect(bbox[3]).toBeCloseTo(y + 500, 3)
    expect(u.searchParams.get('styles')).toBe('')
    expect(u.searchParams.has('colorscalerange')).toBe(false)
  })
  it('returns null for layers without info config', () => {
    expect(infoUrl(layerById('localities')!, [5, 60], 10)).toBeNull()
  })
})
