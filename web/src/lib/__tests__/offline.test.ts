import { describe, expect, it } from 'vitest'
import { areaUrls, tileUrl, tilesInBounds } from '../offline'
import type { LayerDef } from '../layers'

const xyz: LayerDef = {
  id: 'x', title: 'x', group: 'base', kind: 'xyz', url: 'https://t/{z}/{y}/{x}.png',
  organisation: '', license: '', attribution: '', cache: 'cache-first', maxzoom: 18,
}
const wms: LayerDef = {
  id: 'w', title: 'w', group: 'overlay', kind: 'wms', url: 'https://w/wms', wmsLayers: 'L',
  params: { styles: 'S' }, organisation: '', license: '', attribution: '', cache: 'cache-first',
}

describe('tilesInBounds', () => {
  it('covers the world with one tile at zoom 0', () => {
    expect(tilesInBounds({ west: -180, south: -85, east: 180, north: 85 }, 0, 0)).toEqual([{ z: 0, x: 0, y: 0 }])
  })
  it('enumerates all four tiles at zoom 1', () => {
    expect(tilesInBounds({ west: -180, south: -85, east: 180, north: 85 }, 1, 1)).toHaveLength(4)
  })
  it('maps a Norwegian point to the expected tile', () => {
    // 8.5E 63.5N at z5 lies in x=16, y=8
    expect(tilesInBounds({ west: 8.5, south: 63.5, east: 8.5, north: 63.5 }, 5, 5)).toEqual([{ z: 5, x: 16, y: 8 }])
  })
  it('accumulates across zoom levels', () => {
    const t = tilesInBounds({ west: 5, south: 59, east: 6, north: 60 }, 8, 10)
    expect(t.filter((x) => x.z === 8).length).toBeLessThan(t.filter((x) => x.z === 10).length)
  })
})

describe('tileUrl', () => {
  it('fills xyz templates', () => {
    expect(tileUrl(xyz, { z: 5, x: 16, y: 8 })).toBe('https://t/5/8/16.png')
  })
  it('builds a WMS request with an EPSG:3857 bbox and extra params', () => {
    const u = new URL(tileUrl(wms, { z: 0, x: 0, y: 0 }))
    expect(u.searchParams.get('layers')).toBe('L')
    expect(u.searchParams.get('styles')).toBe('S')
    const bbox = u.searchParams.get('bbox')!.split(',').map(Number)
    expect(bbox[0]).toBeCloseTo(-20037508.34, 1)
    expect(bbox[3]).toBeCloseTo(20037508.34, 1)
  })
})

describe('areaUrls', () => {
  it('respects layer maxzoom and skips geojson layers', () => {
    const geo: LayerDef = { ...xyz, id: 'g', kind: 'geojson', url: 'data/x.geojson' }
    const capped: LayerDef = { ...xyz, maxzoom: 1 }
    const urls = areaUrls([capped, geo], { west: -180, south: -85, east: 180, north: 85 }, 0, 2)
    expect(urls).toHaveLength(1 + 4)
  })
})
